// src/ui/nodes/vars/VarNode.tsx
// Variable node with inline editors (safe updates).
// All graph patches are deferred (microtask / rAF) to avoid
// "Cannot update a component while rendering a different component" warnings.

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
  ioShapeOf,
  isVector as isVectorType,
  vectorElem,
} from '../../../ptb/graph/typecheck';
import type { Port, PTBNode, VariableNode } from '../../../ptb/graph/types';
import { PTBHandleIO } from '../../handles/PTBHandleIO';
import { iconOfVar } from '../icons';
import { MiniStepper } from './inputs/MiniStepper';
import { NODE_SIZES } from '../../utils/nodeSizes';

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
        // run outside render stack
        Promise.resolve().then(() => fnRef.current(...args));
        timerRef.current = undefined;
      }, delay);
    },
    [delay],
  );
}

/** Post a function to the microtask queue (always after current render). */
function defer(fn: () => void) {
  // queueMicrotask is ideal; fallback to resolved Promise
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

  const { category } = ioShapeOf(varType);

  // Helpers/constants are label-only.
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

  // Local UI state.
  const [scalarBuf, setScalarBuf] = useState(''); // scalar text & object id
  const [vecItems, setVecItems] = useState<string[]>(['']); // min=1
  const [objTypeLoading, setObjTypeLoading] = useState(false);

  // Graph patcher (always deferred)
  const patchVar = useCallback(
    (patch: Partial<VariableNode>) => {
      if (!canEdit || !nodeId || !data?.onPatchVar) return;
      defer(() => data.onPatchVar!(nodeId, patch));
    },
    [canEdit, nodeId, data],
  );

  // Update internals (always deferred to rAF)
  const requestInternals = useCallback(() => {
    if (!rfNodeId) return;
    requestAnimationFrame(() => updateNodeInternals(rfNodeId));
  }, [rfNodeId, updateNodeInternals]);

  // Shallow-equal helper for arrays of strings.
  const arrShallowEqual = useCallback((a: string[], b: string[]) => {
    if (a === b) return true;
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
  }, []);

  // Sync local buffers from graph on prop changes.
  useEffect(() => {
    if (!isVectorType(varType)) {
      const next =
        (v as any)?.value == undefined ? '' : String((v as any)?.value);
      setScalarBuf((prev) => (prev === next ? prev : next));
    } else {
      const raw = (v as any)?.value;
      const next =
        Array.isArray(raw) && raw.length > 0 ? raw.map(String) : [''];
      setVecItems((prev) => (arrShallowEqual(prev, next) ? prev : next));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodeId, v, varType, arrShallowEqual]);

  // Default scalar<bool>=true once (only editable & not helper).
  useEffect(() => {
    if (!canEdit || isHelper) return;
    if (varType?.kind === 'scalar' && varType.name === 'bool') {
      const val = (v as any)?.value as boolean | undefined;
      if (typeof val === 'undefined') {
        patchVar({ value: true });
      }
    }
  }, [canEdit, isHelper, varType, v, patchVar]);

  // Debounced patchers for text-based inputs.
  const debouncedPatchScalar = useDebouncedCallback((val: string) => {
    patchVar({ value: val });
  });

  const debouncedPatchVector = useDebouncedCallback((vals: string[]) => {
    patchVar({ value: vals });
  });

  // Debounced object handler: patch value, fetch meta, then patch varType.
  const reqSeqRef = useRef(0);
  const debouncedHandleObject = useDebouncedCallback(async (idRaw: string) => {
    if (!canEdit) return;

    const id = idRaw.trim();
    // Keep graph in sync while typing (deferred)
    patchVar({ value: idRaw });

    // Empty → clear typeTag and stop
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

  // Out port (with optional human-friendly typeStr).
  const outPort: Port = useMemo(() => buildOutPort(v), [v]);

  const hasEditor = useMemo(() => !isHelper, [isHelper]);

  // Stepper (+/-)
  const stepVec = useCallback(
    (delta: number) => {
      if (!canEdit || !isVectorType(varType)) return;
      setVecItems((prev) => {
        const nextLen = Math.max(1, prev.length + delta);
        const next =
          nextLen > prev.length
            ? [
                ...prev,
                ...Array.from({ length: nextLen - prev.length }, () => ''),
              ]
            : prev.slice(0, nextLen);
        // Defer graph patch + internals recompute
        patchVar({ value: next });
        requestInternals();
        return next;
      });
    },
    [canEdit, varType, patchVar, requestInternals],
  );

  // Recompute bounds when height-affecting state toggles.
  useEffect(() => {
    requestInternals();
  }, [rfNodeId, vecItems.length, hasEditor, varType?.kind, requestInternals]);

  const title = (data?.label ?? v?.label ?? 'variable').trim();
  const elemT = vectorElem(varType);
  const vecPlaceholder = placeholderFor(elemT);

  const objectTypeTag =
    varType?.kind === 'object' ? (varType as any)?.typeTag : undefined;

  // Parse → boolean | undefined (no auto-writeback here)
  const parseBool = (x: unknown): boolean | undefined => {
    if (typeof x === 'boolean') return x;
    if (typeof x === 'string') {
      const s = x.trim().toLowerCase();
      if (s === 'true') return true;
      if (s === 'false') return false;
    }
    return undefined;
  };

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
        {/* Header: icon (left) + vector stepper (right) */}
        <div className="flex items-center justify-between">
          <p className="flex items-center gap-1 text-xxs text-gray-800 dark:text-gray-200">
            {iconOfVar(v, data?.label)}
            {title}
          </p>

          {!isHelper && isVectorType(varType) && (
            <MiniStepper
              decDisabled={!canEdit || vecItems.length <= 1 || readOnly}
              incDisabled={!canEdit || readOnly}
              onDec={() => stepVec(-1)}
              onInc={() => stepVec(+1)}
            />
          )}
        </div>

        {/* Editors (disabled when !canEdit or helper) */}
        {!isHelper && (
          <div className="mt-2">
            {isVectorType(varType) ? (
              // ===== Vector editor =====
              <div className="space-y-1">
                {vecItems.map((val, i) => {
                  const isBoolElem =
                    elemT?.kind === 'scalar' && elemT.name === 'bool';

                  if (isBoolElem) {
                    // Controlled without auto-writeback on mount
                    const b = parseBool(val);
                    return (
                      <SelectBool
                        key={`vec-bool-${i}`}
                        value={b}
                        onChange={(newVal) => {
                          setVecItems((prev) => {
                            const next = prev.slice();
                            next[i] = newVal as boolean | undefined as any;
                            // patch & internals after state commit
                            defer(() => patchVar({ value: next }));
                            requestInternals();
                            return next;
                          });
                        }}
                        disabled={!canEdit}
                      />
                    );
                  }

                  // vector<others>: TextInput (debounced)
                  return (
                    <TextInput
                      key={`vec-${i}`}
                      value={typeof val === 'string' ? val : String(val ?? '')}
                      placeholder={`${vecPlaceholder} [${i}]`}
                      onChange={(e) => {
                        const vv = e.target.value;
                        setVecItems((prev) => {
                          const copy = prev.slice();
                          copy[i] = vv;
                          if (canEdit) {
                            debouncedPatchVector(copy);
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
            ) : varType?.kind === 'scalar' && varType.name === 'bool' ? (
              // ===== Scalar<bool>: SelectBool (no auto default write) =====
              <SelectBool
                value={(v as any)?.value as boolean | undefined}
                onChange={(val) => {
                  if (!canEdit) return;
                  patchVar({ value: val });
                }}
                disabled={!canEdit}
              />
            ) : (
              // ===== Unified TextInput for scalar & object =====
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

                {/* Object: read-only type field (no inline error) */}
                {varType?.kind === 'object' && (
                  <TextInput
                    value={objectTypeTag || ''}
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
