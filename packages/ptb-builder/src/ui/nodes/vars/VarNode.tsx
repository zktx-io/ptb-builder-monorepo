// src/ui/nodes/vars/VarNode.tsx
// Variable node with inline editors (except helper/constant vars).
// - Scalars: address/string/number → <input> (debounced), bool → SelectBool
// - Object: object id <input> (debounced), typeTag <input> (debounced) + "Load" button
// - Vectors (1-D): N editors; item count stepper in the header (right-aligned)
//     • vector<bool> → SelectBool per item (immediate patch)
//     • vector<others> → <input> per item (debounced patch)
// - Helpers (sender/wallet, gas, clock, system, random, sui[=0x2::sui::SUI]): label only, no editor
// - If no onPatchVar is provided, all editors and the stepper are disabled (read-only)
// - No nulls: use undefined

import React, {
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

import SelectBool from './inputs/SelectBool';
import TextInput from './inputs/TextInput';
import { buildOutPort, placeholderFor } from './utils';
import {
  ioShapeOf,
  isVector as isVectorType,
  vectorElem,
} from '../../../ptb/graph/typecheck';
import type { Port, PTBNode, VariableNode } from '../../../ptb/graph/types';
import { PTBHandleIO } from '../../handles/PTBHandleIO';
import { iconOfVar } from '../icons/varIcons';
import { MiniStepper } from './inputs/MiniStepper';

const DEBOUNCE_MS = 250;

export type VarData = {
  label?: string;
  ptbNode?: PTBNode;
  onPatchVar?: (nodeId: string, patch: Partial<VariableNode>) => void;
  onLoadTypeTag?: (typeTag: string) => void;
};
export type VarRFNode = Node<VarData, 'ptb-var'>;

/** Small hook: returns a stable debounced-callback (cleans up on unmount). */
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
        fnRef.current(...args);
        timerRef.current = undefined;
      }, delay);
    },
    [delay],
  );
}

export function VarNode({ id: rfNodeId, data }: NodeProps<VarRFNode>) {
  const v = data?.ptbNode as VariableNode | undefined;
  const nodeId = v?.id; // PTB node id (for graph patch)
  const varType = v?.varType;

  const updateNodeInternals = useUpdateNodeInternals();

  // Editors/stepper are enabled only when onPatchVar exists.
  const canEdit = Boolean(nodeId && data?.onPatchVar);

  const { category } = ioShapeOf(varType);

  /** Detect helpers/constants: show label only. */
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

  /** Local buffers for controlled inputs. */
  const [scalarBuf, setScalarBuf] = useState(''); // for scalar text inputs (non-bool)
  const [typeTagBuf, setTypeTagBuf] = useState(''); // for object.typeTag
  const [vecItems, setVecItems] = useState<string[]>(['']); // for vector inputs (min=1)

  /** Shallow-equal helper for arrays of strings. */
  const arrShallowEqual = useCallback((a: string[], b: string[]) => {
    if (a === b) return true;
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
  }, []);

  /** Sync local buffers from graph when props change, but avoid stomping identical state. */
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
    if (varType?.kind === 'object') {
      const nextTT = varType.typeTag ?? '';
      setTypeTagBuf((prev) => (prev === nextTT ? prev : nextTT));
    } else if (typeTagBuf !== '') {
      setTypeTagBuf('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodeId, v, varType, arrShallowEqual]);

  /** Default bool=true once (only when editable & not helper). */
  useEffect(() => {
    if (!canEdit || isHelper) return;
    if (varType?.kind === 'scalar' && varType.name === 'bool') {
      const val = (v as any)?.value as boolean | undefined;
      if (typeof val === 'undefined' && data?.onPatchVar && nodeId) {
        data.onPatchVar(nodeId, { value: true });
      }
    }
  }, [canEdit, isHelper, varType, data, nodeId, v]);

  /** Patch helper (graph-level). */
  const patchVar = useCallback(
    (patch: Partial<VariableNode>) => {
      if (canEdit && nodeId && data?.onPatchVar) data.onPatchVar(nodeId, patch);
    },
    [canEdit, nodeId, data],
  );

  /** Debounced patchers for text-based inputs (scalar & vector text & typeTag). */
  const debouncedPatchScalar = useDebouncedCallback((val: string) => {
    if (!canEdit) return;
    patchVar({ value: val });
  });

  const debouncedPatchVector = useDebouncedCallback((vals: string[]) => {
    if (!canEdit) return;
    patchVar({ value: vals });
  });

  const debouncedPatchTypeTag = useDebouncedCallback((typeTag: string) => {
    if (!canEdit) return;
    const trimmed = (typeTag.trim() || undefined) as string | undefined;
    patchVar({
      varType: trimmed
        ? { kind: 'object', typeTag: trimmed }
        : { kind: 'object' },
    });
  });

  /** Out port (with optional human-friendly typeStr). */
  const outPort: Port = useMemo(() => buildOutPort(v), [v]);

  /** Show editor area? */
  const hasEditor = useMemo(() => !isHelper, [isHelper]);

  /** Stepper (+/-) — apply immediately to graph and request layout recompute. */
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
        // Immediately patch length change (user intent)
        patchVar({ value: next });
        // Ensure React Flow recomputes the node's bounds
        requestAnimationFrame(() => updateNodeInternals(rfNodeId));
        return next;
      });
    },
    [canEdit, varType, patchVar, rfNodeId, updateNodeInternals],
  );

  /** Also recompute layout when height-affecting state toggles. */
  useEffect(() => {
    if (!rfNodeId) return;
    requestAnimationFrame(() => updateNodeInternals(rfNodeId));
  }, [
    rfNodeId,
    vecItems.length,
    hasEditor,
    varType?.kind,
    updateNodeInternals,
  ]);

  /** Header/title/icon + placeholders. */
  const title = (data?.label ?? v?.label ?? 'variable').trim();
  const elemT = vectorElem(varType);
  const vecPlaceholder = placeholderFor(elemT);

  /** On-chain type loader: always visible; disabled if missing handler. */
  const hasLoader = typeof data?.onLoadTypeTag === 'function';
  const loadTypeDisabled = !typeTagBuf.trim() || !canEdit || !hasLoader;

  /** Helper: robust parse → boolean | undefined from string/boolean. */
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
        className={[
          'ptb-node-shell rounded-lg py-2 px-2 border-2 shadow relative',
          isHelper ? 'w-[140px]' : hasEditor ? 'w-[220px]' : 'w-[180px]',
          'min-w-[140px]',
        ].join(' ')}
      >
        {/* Header: icon (left) + vector stepper (right) */}
        <div className="flex items-center justify-between">
          <p className="flex items-center gap-1 text-sm text-gray-800 dark:text-gray-200">
            {iconOfVar(v, data?.label)}
            {title}
          </p>

          {!isHelper && isVectorType(varType) && (
            <MiniStepper
              decDisabled={!canEdit || vecItems.length <= 1}
              incDisabled={!canEdit}
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

                  // Vector<bool>: SelectBool per item (immediate patch)
                  if (isBoolElem) {
                    const b = parseBool(val);
                    return (
                      <SelectBool
                        key={`vec-bool-${i}`}
                        value={b}
                        onChange={(newVal) => {
                          setVecItems((prev) => {
                            const next = prev.slice();
                            next[i] = newVal as unknown as any;
                            if (canEdit) {
                              patchVar({ value: next }); // immediate
                              requestAnimationFrame(() =>
                                updateNodeInternals(rfNodeId),
                              );
                            }
                            return next;
                          });
                        }}
                        disabled={!canEdit}
                      />
                    );
                  }

                  // Vector<other scalars/strings/numbers>: TextInput (debounced patch)
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
                            // height might change with line wraps
                            requestAnimationFrame(() =>
                              updateNodeInternals(rfNodeId),
                            );
                          }
                          return copy;
                        });
                      }}
                      onBlur={() => {
                        // Final sync on blur (ensures latest value lands)
                        if (canEdit) patchVar({ value: vecItems });
                      }}
                      disabled={!canEdit}
                    />
                  );
                })}
              </div>
            ) : varType?.kind === 'scalar' && varType.name === 'bool' ? (
              // ===== Scalar<bool>: SelectBool (unified) =====
              <SelectBool
                value={(v as any)?.value as boolean | undefined}
                onChange={(val) => canEdit && patchVar({ value: val })}
                disabled={!canEdit}
              />
            ) : varType?.kind === 'object' ? (
              // ===== Object editor =====
              <>
                {/* object id (value) — debounced */}
                <div className="mb-1">
                  <TextInput
                    value={
                      (v as any)?.value == undefined
                        ? ''
                        : String((v as any)?.value)
                    }
                    placeholder={placeholderFor(varType)}
                    onChange={(e) => {
                      const s = e.target.value;
                      setScalarBuf(s);
                      if (canEdit) debouncedPatchScalar(s);
                    }}
                    onBlur={() => canEdit && patchVar({ value: scalarBuf })}
                    disabled={!canEdit}
                  />
                </div>

                {/* typeTag + Load button (debounced) */}
                <div className="flex items-center gap-2">
                  <div className="flex-1">
                    <TextInput
                      value={typeTagBuf}
                      onChange={(e) => {
                        const s = e.target.value;
                        setTypeTagBuf(s);
                        if (canEdit) debouncedPatchTypeTag(s);
                      }}
                      onBlur={() => {
                        if (!canEdit) return;
                        const trimmed = (typeTagBuf.trim() || undefined) as
                          | string
                          | undefined;
                        patchVar({
                          varType: trimmed
                            ? { kind: 'object', typeTag: trimmed }
                            : { kind: 'object' },
                        });
                      }}
                      placeholder="typeTag (optional)"
                      disabled={!canEdit}
                    />
                  </div>
                  <div className="shrink-0">
                    <button
                      type="button"
                      className="px-2 py-1 text-[11px] border rounded bg-white dark:bg-stone-900 
                                 border-gray-300 dark:border-stone-700 text-gray-900 dark:text-gray-100 
                                 disabled:opacity-50"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => data?.onLoadTypeTag?.(typeTagBuf.trim())}
                      disabled={loadTypeDisabled}
                      title={
                        hasLoader
                          ? 'Load on-chain type metadata'
                          : 'No loader available'
                      }
                    >
                      Load
                    </button>
                  </div>
                </div>
              </>
            ) : (
              // ===== Scalar (non-bool): TextInput (debounced) =====
              <TextInput
                value={scalarBuf}
                onChange={(e) => {
                  const s = e.target.value;
                  setScalarBuf(s);
                  if (canEdit) debouncedPatchScalar(s);
                }}
                onBlur={() => canEdit && patchVar({ value: scalarBuf })}
                placeholder={placeholderFor(varType)}
                disabled={!canEdit}
              />
            )}
          </div>
        )}

        {/* Out handle */}
        <PTBHandleIO port={outPort} position={Position.Right as Position} />
      </div>
    </div>
  );
}

export default React.memo(VarNode);
