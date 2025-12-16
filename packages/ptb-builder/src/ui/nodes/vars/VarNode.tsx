// src/ui/nodes/vars/VarNode.tsx
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
import { OptionToggle } from './inputs/OptionToggle';

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

/** Post a function to the microtask queue (after current render). */
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

  // Editability
  const canEdit = Boolean(nodeId && data?.onPatchVar) && !readOnly;

  // Visual category for node chrome
  const category = ioCategoryOf(varType);

  // Helper variables (label-only)
  const helperNames = useMemo(
    () => new Set(['sender', 'gas', 'clock', 'system', 'random']),
    [],
  );
  // NOTE: helpers have chrome-only visuals (no editor area & fixed labels).
  const isHelperByName = useMemo(() => {
    const n = (v?.name ?? '').toLowerCase().trim();
    return helperNames.has(n);
  }, [v?.name, helperNames]);
  const isSuiConst =
    (data?.label ?? v?.label ?? '').trim() === '0x2::sui::SUI' ||
    (v?.name ?? '').trim().toLowerCase() === 'sui';
  const isHelper = isHelperByName || isSuiConst;

  // Local UI buffers
  const [scalarBuf, setScalarBuf] = useState(''); // scalar & object id (also Option<T> inner)
  const [vecItems, setVecItems] = useState<string[]>(['']); // vector<T> editor
  const [optSome, setOptSome] = useState<boolean>(false); // Option<T> toggle
  const [objTypeLoading, setObjTypeLoading] = useState(false);

  // Patcher
  const patchVar = useCallback(
    (patch: Partial<VariableNode>) => {
      if (!canEdit || !nodeId || !data?.onPatchVar) return;
      defer(() => data.onPatchVar!(nodeId, patch));
    },
    [canEdit, nodeId, data],
  );

  // Layout refresh
  const requestInternals = useCallback(() => {
    if (!rfNodeId) return;
    requestAnimationFrame(() => updateNodeInternals(rfNodeId));
  }, [rfNodeId, updateNodeInternals]);

  // Array shallow-eq
  const arrShallowEqual = useCallback((a: string[], b: string[]) => {
    if (a === b) return true;
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
  }, []);

  // Derived flags for minimal branching
  const isOption = isOptionType(varType);
  const isVector = isVectorType(varType);
  const isScalarBool = varType?.kind === 'scalar' && varType.name === 'bool';

  const optionInner = useMemo(
    () => (isOption ? optionElem(varType) : undefined),
    [isOption, varType],
  );
  const vecElem = useMemo(
    () => (isVector ? vectorElem(varType) : undefined),
    [isVector, varType],
  );

  // Sync buffers from graph → keep previous buffer when option is None
  useEffect(() => {
    const val = (v as any)?.value;

    if (isOption) {
      const isNone = val === undefined;
      setOptSome(!isNone);
      if (!isNone) {
        const s = String(val ?? '');
        setScalarBuf((prev) => (prev === s ? prev : s));
      }
      return;
    }

    if (isVector) {
      const arr = Array.isArray(val) && val.length > 0 ? val.map(String) : [''];
      setVecItems((prev) => (arrShallowEqual(prev, arr) ? prev : arr));
      return;
    }

    const s = val === undefined ? '' : String(val);
    setScalarBuf((prev) => (prev === s ? prev : s));
  }, [nodeId, v, isOption, isVector, arrShallowEqual]);

  // Default scalar<bool>=true once (non-helper)
  useEffect(() => {
    if (!canEdit || isHelper || !isScalarBool) return;
    const val = (v as any)?.value as boolean | undefined;
    if (typeof val === 'undefined') patchVar({ value: true });
  }, [canEdit, isHelper, isScalarBool, v, patchVar]);

  // Debounced patchers
  const debouncedPatchScalar = useDebouncedCallback((val: string) => {
    patchVar({ value: val });
  });
  const debouncedPatchVector = useDebouncedCallback((vals: string[]) => {
    patchVar({ value: vals });
  });

  // Debounced object handler (top-level scalar object only)
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

      if (resp) {
        patchVar({ varType: { kind: 'object', typeTag: resp.typeTag } });
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

  // Port
  const outPort: Port = useMemo(() => buildOutPort(v), [v]);

  // For layout
  const hasEditor = useMemo(() => !isHelper, [isHelper]);

  // Vector stepper
  const stepVec = useCallback(
    (delta: number) => {
      if (!canEdit || !isVector) return;
      setVecItems((prev) => {
        const nextLen = Math.max(1, prev.length + delta);
        const next =
          nextLen > prev.length
            ? [
                ...prev,
                ...Array.from({ length: nextLen - prev.length }, () => ''),
              ]
            : prev.slice(0, nextLen);
        patchVar({ value: next });
        requestInternals();
        return next;
      });
    },
    [canEdit, isVector, patchVar, requestInternals],
  );

  // Refresh internals on height-affecting changes
  useEffect(() => {
    requestInternals();
  }, [
    rfNodeId,
    vecItems.length,
    hasEditor,
    isVector,
    isOption,
    optSome,
    requestInternals,
  ]);

  const title = (data?.label ?? v?.label ?? 'variable').trim();

  // Render vector editor
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
                    defer(() => patchVar({ value: next }));
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
                    debouncedPatchVector(copy as any);
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

  // Option input derived UI
  const optionInputDisabled = isOption && (!optSome || !canEdit);
  const optionInputPlaceholder = isOption
    ? optSome
      ? placeholderFor(optionInner)
      : 'none'
    : '';

  return (
    <div className={`ptb-node--${category}`}>
      <div
        className="ptb-node-shell rounded-lg py-2 px-2 border-2 shadow relative"
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

          <div className="flex items-center gap-1">
            {/* Vector stepper */}
            {!isHelper && isVector && (
              <MiniStepper
                decDisabled={!canEdit || vecItems.length <= 1 || readOnly}
                incDisabled={!canEdit || readOnly}
                onDec={() => stepVec(-1)}
                onInc={() => stepVec(+1)}
              />
            )}

            {/* iOS-style option toggle */}
            {!isHelper && isOption && (
              <OptionToggle
                some={optSome}
                disabled={!canEdit || readOnly}
                onToggle={(next) => {
                  setOptSome(next);
                  patchVar({ value: next ? scalarBuf : undefined });
                  requestInternals();
                }}
              />
            )}
          </div>
        </div>

        {/* Editors */}
        {!isHelper && (
          <div className="mt-2">
            {isOption ? (
              // ===== Option<T>: always show TextInput; disabled when None =====
              <TextInput
                value={scalarBuf}
                placeholder={optionInputPlaceholder}
                onChange={(e) => {
                  const s = e.target.value;
                  setScalarBuf(s);
                  if (!canEdit || !optSome) return;
                  // Option<bool> also uses TextInput per requirement
                  debouncedPatchScalar(s);
                }}
                disabled={optionInputDisabled}
              />
            ) : isVector ? (
              // ===== Vector<T> =====
              renderVectorEditor(vecElem)
            ) : isScalarBool ? (
              // ===== Scalar<bool> (non-option) =====
              <SelectBool
                value={(v as any)?.value as boolean | undefined}
                onChange={(val) => canEdit && patchVar({ value: val })}
                disabled={!canEdit}
              />
            ) : (
              // ===== Scalar & Object (top-level only) =====
              <>
                <TextInput
                  value={scalarBuf}
                  placeholder={placeholderFor(varType)}
                  onChange={(e) => {
                    const s = e.target.value;
                    setScalarBuf(s);
                    if (!canEdit) return;

                    if (varType?.kind === 'object') {
                      // Only for top-level object
                      debouncedHandleObject(s);
                    } else {
                      debouncedPatchScalar(s);
                    }
                  }}
                  disabled={!canEdit}
                />
                {varType?.kind === 'object' ? (
                  <TextInput
                    value={(varType as any)?.typeTag || ''}
                    placeholder={
                      objTypeLoading ? 'Loading type…' : 'type (read-only)'
                    }
                    readOnly
                    aria-readonly="true"
                    onChange={() => {}}
                  />
                ) : (
                  <></>
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
