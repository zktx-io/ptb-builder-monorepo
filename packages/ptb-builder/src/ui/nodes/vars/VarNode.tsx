import React, {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import {
  type Node,
  type NodeProps,
  Position,
  useUpdateNodeInternals,
} from '@xyflow/react';

import { usePtb } from '../../PtbProvider';
import { SelectBool } from './inputs/SelectBool';
import { TextInput } from './inputs/TextInput';
import { buildOutPort, placeholderFor } from './varUtils';
import {
  ioCategoryOf,
  isOption as isOptionType,
  isVector as isVectorType,
  optionElem,
  vectorElem,
} from '../../../ptb/graph/typecheck';
import type { Port, PTBNode, VariableNode } from '../../../ptb/graph/types';
import { PTBHandleIO } from '../../handles/PTBHandleIO';
import { iconOfVar } from '../icons';
import { NODE_SIZES } from '../nodeLayout';
import { MiniStepper } from './inputs/MiniStepper';

const DEBOUNCE_MS = 250;
const OBJECT_DEBOUNCE_MS = 400;

export type VarData = {
  label?: string;
  ptbNode?: PTBNode;
  onPatchVar?: (nodeId: string, patch: Partial<VariableNode>) => void;
  onLoadTypeTag?: (typeTag: string) => void;
};
export type VarRFNode = Node<VarData, 'ptb-var'>;

/** Debounced-callback helper (cleans up on unmount). */
function useDebouncedCallback<T extends any[]>(
  fn: (...args: T) => void,
  delay = DEBOUNCE_MS,
) {
  const fnRef = useRef(fn);
  const timerRef = useRef<number | undefined>(undefined);
  useEffect(() => {
    fnRef.current = fn;
  }, [fn]);
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        window.clearTimeout(timerRef.current);
        timerRef.current = undefined;
      }
    };
  }, []);
  return useCallback(
    (...args: T) => {
      if (timerRef.current) {
        window.clearTimeout(timerRef.current);
        timerRef.current = undefined;
      }
      timerRef.current = window.setTimeout(() => {
        Promise.resolve().then(() => fnRef.current(...args));
        timerRef.current = undefined;
      }, delay);
    },
    [delay],
  );
}

/** Post a function to the microtask queue (always after current render). */
function defer(fn: () => void) {
  if (typeof queueMicrotask === 'function') queueMicrotask(fn);
  else Promise.resolve().then(fn);
}

export const VarNode = memo(function VarNode({
  id: rfNodeId,
  data,
}: NodeProps<VarRFNode>) {
  const v = data?.ptbNode as VariableNode | undefined;
  const nodeId = v?.id;
  const varType = v?.varType;

  const updateNodeInternals = useUpdateNodeInternals();
  const { getObjectData, readOnly, toast } = usePtb();

  // Editors enabled only when onPatchVar exists.
  const canEdit = Boolean(nodeId && data?.onPatchVar) && !readOnly;

  // Category is for node chrome only (color).
  const category = ioCategoryOf(varType);

  // Helper variables are label-only (no editors).
  const helperNames = useMemo(
    () => new Set(['sender', 'gas', 'clock', 'system', 'random']),
    [],
  );
  const isHelperByName = useMemo(() => {
    const n = (v?.name ?? '').toLowerCase().trim();
    return helperNames.has(n);
  }, [v?.name, helperNames]);
  const isSuiConst =
    (data?.label ?? v?.label ?? '').trim() === '0x2::sui::SUI' ||
    (v?.name ?? '').trim().toLowerCase() === 'sui';
  const isHelper = isHelperByName || isSuiConst;

  // Local UI buffers
  const [scalarBuf, setScalarBuf] = useState(''); // scalar & object id
  const [vecItems, setVecItems] = useState<string[]>(['']); // vector editor
  const [optSome, setOptSome] = useState<boolean>(false); // option<T>
  const [objTypeLoading, setObjTypeLoading] = useState(false);

  // Graph patcher (always deferred)
  const patchVar = useCallback(
    (patch: Partial<VariableNode>) => {
      if (!canEdit || !nodeId || !data?.onPatchVar) return;
      defer(() => data.onPatchVar!(nodeId, patch));
    },
    [canEdit, nodeId, data],
  );

  // Update internals after layout-affecting changes
  const requestInternals = useCallback(() => {
    if (!rfNodeId) return;
    requestAnimationFrame(() => updateNodeInternals(rfNodeId));
  }, [rfNodeId, updateNodeInternals]);

  // Shallow-equal for string arrays
  const arrShallowEqual = useCallback((a: string[], b: string[]) => {
    if (a === b) return true;
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
  }, []);

  // Sync local buffers from graph when inputs change
  useEffect(() => {
    const val = (v as any)?.value;

    if (isOptionType(varType)) {
      // option<T>: expect value = null | undefined | innerValue
      const innerT = optionElem(varType);
      const isNone = val == undefined;
      setOptSome(!isNone);

      if (!innerT) return;

      if (isVectorType(innerT)) {
        const arr =
          Array.isArray(val) && val.length > 0 ? val.map(String) : [''];
        setVecItems((prev) => (arrShallowEqual(prev, arr) ? prev : arr));
      } else {
        const s = val == undefined ? '' : String(val);
        setScalarBuf((prev) => (prev === s ? prev : s));
      }
      return;
    }

    if (isVectorType(varType)) {
      const arr = Array.isArray(val) && val.length > 0 ? val.map(String) : [''];
      setVecItems((prev) => (arrShallowEqual(prev, arr) ? prev : arr));
    } else {
      const s = val == undefined ? '' : String(val);
      setScalarBuf((prev) => (prev === s ? prev : s));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodeId, v, varType, arrShallowEqual]);

  // Default scalar<bool>=true once (not for helpers)
  useEffect(() => {
    if (!canEdit || isHelper) return;
    if (varType?.kind === 'scalar' && varType.name === 'bool') {
      const val = (v as any)?.value as boolean | undefined;
      if (typeof val === 'undefined') patchVar({ value: true });
    }
  }, [canEdit, isHelper, varType, v, patchVar]);

  // Debounced patchers
  const debouncedPatchScalar = useDebouncedCallback((val: string) => {
    patchVar({ value: val });
  });
  const debouncedPatchVector = useDebouncedCallback((vals: string[]) => {
    patchVar({ value: vals });
  });

  // Debounced object handler: patch value, fetch meta, then patch varType
  const reqSeqRef = useRef(0);
  const debouncedHandleObject = useDebouncedCallback(async (idRaw: string) => {
    if (!canEdit) return;

    const id = idRaw.trim();
    patchVar({ value: idRaw });

    if (!id) {
      patchVar({ varType: { kind: 'object' } });
      setObjTypeLoading(false);
      return;
    }

    const seq = ++reqSeqRef.current;
    try {
      setObjTypeLoading(true);
      const resp = await getObjectData(id, { forceRefresh: true });
      if (seq !== reqSeqRef.current) return;

      const moveType =
        resp?.content?.dataType === 'moveObject'
          ? (resp.content as any)?.type
          : undefined;

      if (moveType) {
        patchVar({ varType: { kind: 'object', typeTag: moveType } });
      } else {
        patchVar({ varType: { kind: 'object' } });
        toast?.({
          message: 'Object not found or not a Move object.',
          variant: 'error',
        });
      }
    } catch (e: any) {
      if (seq !== reqSeqRef.current) return;
      patchVar({ varType: { kind: 'object' } });
      toast?.({
        message: e?.message || 'Failed to fetch object metadata.',
        variant: 'error',
      });
    } finally {
      if (seq === reqSeqRef.current) setObjTypeLoading(false);
    }
  }, OBJECT_DEBOUNCE_MS);

  // Out port (with optional human-friendly typeStr)
  const outPort: Port = useMemo(() => buildOutPort(v), [v]);

  const hasEditor = useMemo(() => !isHelper, [isHelper]);

  // Vector length stepper
  const stepVec = useCallback(
    (delta: number) => {
      const t = isOptionType(varType) ? optionElem(varType) : varType;
      if (!canEdit || !isVectorType(t)) return;
      setVecItems((prev) => {
        const nextLen = Math.max(1, prev.length + delta);
        const next =
          nextLen > prev.length
            ? [
                ...prev,
                ...Array.from({ length: nextLen - prev.length }, () => ''),
              ]
            : prev.slice(0, nextLen);
        const assign = isOptionType(varType)
          ? optSome
            ? next
            : undefined
          : next;
        patchVar({ value: assign });
        requestInternals();
        return next;
      });
    },
    [canEdit, varType, optSome, patchVar, requestInternals],
  );

  // Relayout when height-affecting state toggles
  useEffect(() => {
    requestInternals();
  }, [
    rfNodeId,
    vecItems.length,
    hasEditor,
    varType?.kind,
    optSome,
    requestInternals,
  ]);

  const title = (data?.label ?? v?.label ?? 'variable').trim();

  const renderVectorEditor = (elemT = vectorElem(varType)) => {
    const isBoolElem = elemT?.kind === 'scalar' && elemT.name === 'bool';
    return (
      <div className="space-y-1">
        {vecItems.map((val, i) => {
          if (isBoolElem) {
            const b =
              typeof val === 'boolean'
                ? val
                : typeof val === 'string'
                  ? val.trim().toLowerCase() === 'true'
                    ? true
                    : val.trim().toLowerCase() === 'false'
                      ? false
                      : undefined
                  : undefined;
            return (
              <SelectBool
                key={`vec-bool-${i}`}
                value={b}
                onChange={(newVal) => {
                  setVecItems((prev) => {
                    const next = prev.slice();
                    next[i] = newVal as any;
                    const assign = isOptionType(varType)
                      ? optSome
                        ? next
                        : undefined
                      : next;
                    defer(() => patchVar({ value: assign }));
                    requestInternals();
                    return next;
                  });
                }}
                disabled={!canEdit}
              />
            );
          }
          return (
            <TextInput
              key={`vec-${i}`}
              value={typeof val === 'string' ? val : String(val ?? '')}
              placeholder={`${placeholderFor(elemT)} [${i}]`}
              onChange={(e) => {
                const vv = e.target.value;
                setVecItems((prev) => {
                  const copy = prev.slice();
                  copy[i] = vv;
                  if (canEdit) {
                    const assign = isOptionType(varType)
                      ? optSome
                        ? copy
                        : undefined
                      : copy;
                    debouncedPatchVector(assign as any);
                    requestInternals();
                  }
                  return copy;
                });
              }}
              disabled={!canEdit}
            />
          );
        })}
      </div>
    );
  };

  // Option helpers
  const innerOfOption = optionElem(varType);
  const optionIsVector = isVectorType(innerOfOption);

  return (
    <div className={`ptb-node--${category}`}>
      <div
        className={
          'ptb-node-shell rounded-lg py-2 px-2 border-2 shadow relative'
        }
        style={{
          minWidth: 140,
          width: isHelper ? NODE_SIZES.Helper.width : NODE_SIZES.Variable.width,
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <p className="flex items-center gap-1 text-xxs text-gray-800 dark:text-gray-200">
            {iconOfVar(v, data?.label)}
            {title}
          </p>

          {/* Vector length stepper for vector or option<vector> */}
          {!isHelper && (isVectorType(varType) || optionIsVector) && (
            <MiniStepper
              decDisabled={!canEdit || vecItems.length <= 1 || readOnly}
              incDisabled={!canEdit || readOnly}
              onDec={() => stepVec(-1)}
              onInc={() => stepVec(+1)}
            />
          )}
        </div>

        {/* Editors */}
        {!isHelper && (
          <div className="mt-2">
            {isOptionType(varType) ? (
              // ===== Option<T> editor =====
              <>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xxs text-gray-700 dark:text-gray-300">
                    Option
                  </span>
                  <button
                    type="button"
                    className="text-xxs px-2 py-0.5 rounded border border-gray-300 dark:border-stone-700
                               bg-white hover:bg-gray-100 dark:bg-stone-900 dark:hover:bg-stone-800"
                    onClick={() => {
                      if (!canEdit) return;
                      const next = !optSome;
                      setOptSome(next);
                      // When toggling to None → clear value
                      patchVar({
                        value: next
                          ? optionIsVector
                            ? vecItems
                            : scalarBuf
                          : undefined,
                      });
                      requestInternals();
                    }}
                    disabled={!canEdit}
                    title={optSome ? 'Set None' : 'Set Some'}
                  >
                    {optSome ? 'Some' : 'None'}
                  </button>
                </div>

                {optSome ? (
                  optionIsVector ? (
                    renderVectorEditor(innerOfOption)
                  ) : innerOfOption?.kind === 'scalar' &&
                    innerOfOption.name === 'bool' ? (
                    <SelectBool
                      value={(v as any)?.value as boolean | undefined}
                      onChange={(val) => canEdit && patchVar({ value: val })}
                      disabled={!canEdit}
                    />
                  ) : (
                    <TextInput
                      value={scalarBuf}
                      placeholder={placeholderFor(innerOfOption)}
                      onChange={(e) => {
                        const s = e.target.value;
                        setScalarBuf(s);
                        if (!canEdit) return;
                        if (innerOfOption?.kind === 'object') {
                          debouncedHandleObject(s);
                        } else {
                          debouncedPatchScalar(s);
                        }
                      }}
                      disabled={!canEdit}
                    />
                  )
                ) : (
                  <></>
                )}
              </>
            ) : isVectorType(varType) ? (
              // ===== Vector<T> editor =====
              renderVectorEditor(vectorElem(varType))
            ) : varType?.kind === 'scalar' && varType.name === 'bool' ? (
              // ===== Scalar<bool> =====
              <SelectBool
                value={(v as any)?.value as boolean | undefined}
                onChange={(val) => canEdit && patchVar({ value: val })}
                disabled={!canEdit}
              />
            ) : (
              // ===== Scalar & Object =====
              <>
                <TextInput
                  value={scalarBuf}
                  placeholder={placeholderFor(varType)}
                  onChange={(e) => {
                    const s = e.target.value;
                    setScalarBuf(s);
                    if (!canEdit) return;

                    if (varType?.kind === 'object') {
                      debouncedHandleObject(s);
                    } else {
                      debouncedPatchScalar(s);
                    }
                  }}
                  disabled={!canEdit}
                />
                {varType?.kind === 'object' && (
                  <TextInput
                    value={(varType as any)?.typeTag || ''}
                    placeholder={
                      objTypeLoading ? 'Loading type…' : 'type (read-only)'
                    }
                    readOnly
                    aria-readonly="true"
                    onChange={() => {}}
                  />
                )}
              </>
            )}
          </div>
        )}

        {/* Out handle */}
        <PTBHandleIO port={outPort} position={Position.Right as Position} />
      </div>
    </div>
  );
});

export default VarNode;
