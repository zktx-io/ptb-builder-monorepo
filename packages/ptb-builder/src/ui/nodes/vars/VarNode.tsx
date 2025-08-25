// src/ui/nodes/vars/VarNode.tsx
// Variable node with inline editors (lean version).
// - Scalars (string/number/address): single <TextInput> using onChange+debounce
// - Scalar<bool>: SelectBool (unified; no text input)
// - Object: single <TextInput> (onChange+debounce)
//   • After debounce: patch { value }, fetch on-chain meta via getObjectData(objectId)
//   • If response has a Move object type → patch { varType: { kind:'object', typeTag } }
//   • On failure or non-Move object → patch { varType: { kind:'object' } } and show toast error
//   • Read-only type field shows current typeTag (if any); no inline error text
// - Vectors (1-D):
//   • vector<bool> → SelectBool per item (patch deferred via rAF to avoid cross-render warning)
//   • vector<others> → <TextInput> per item (onChange+debounce)
//   • Stepper (+/-) updates length immediately and requests RF bounds recompute
// - Helpers (sender/wallet, gas, clock, system, random, sui[=0x2::sui::SUI]): label only (no editor)
// - All editors are read-only when onPatchVar is missing
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

import { usePtb } from '../../PtbProvider';
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
import { iconOfVar } from '../icons';
import { MiniStepper } from './inputs/MiniStepper';

const DEBOUNCE_MS = 250;
// Use a slightly longer debounce for object fetches to avoid excessive RPCs while typing fast
const OBJECT_DEBOUNCE_MS = 400;

export type VarData = {
  label?: string;
  ptbNode?: PTBNode;
  onPatchVar?: (nodeId: string, patch: Partial<VariableNode>) => void;
  onLoadTypeTag?: (typeTag: string) => void; // kept for compatibility; unused here
};
export type VarRFNode = Node<VarData, 'ptb-var'>;

/** Stable debounced-callback (cleans up on unmount). */
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

function VarNode({ id: rfNodeId, data }: NodeProps<VarRFNode>) {
  const v = data?.ptbNode as VariableNode | undefined;
  const nodeId = v?.id;
  const varType = v?.varType;

  const updateNodeInternals = useUpdateNodeInternals();
  const { getObjectData, adapters } = usePtb();

  // Editors enabled only when onPatchVar exists.
  const canEdit = Boolean(nodeId && data?.onPatchVar);

  const { category } = ioShapeOf(varType);

  /** Detect helpers/constants: label only. */
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

  /** Local UI state. */
  const [scalarBuf, setScalarBuf] = useState(''); // scalar text & object id
  const [vecItems, setVecItems] = useState<string[]>(['']); // min=1
  const [objTypeLoading, setObjTypeLoading] = useState(false);

  /** Shallow-equal helper for arrays of strings. */
  const arrShallowEqual = useCallback((a: string[], b: string[]) => {
    if (a === b) return true;
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
  }, []);

  /** Sync local buffers from graph on prop changes (avoid stomping equal state). */
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

  /** Graph patcher helper. */
  const patchVar = useCallback(
    (patch: Partial<VariableNode>) => {
      if (canEdit && nodeId && data?.onPatchVar) data.onPatchVar(nodeId, patch);
    },
    [canEdit, nodeId, data],
  );

  /** Debounced patchers for text-based inputs. */
  const debouncedPatchScalar = useDebouncedCallback((val: string) => {
    if (!canEdit) return;
    patchVar({ value: val });
  });

  const debouncedPatchVector = useDebouncedCallback((vals: string[]) => {
    if (!canEdit) return;
    patchVar({ value: vals });
  });

  /** Debounced object handler: patch value, fetch meta, then patch varType. */
  const reqSeqRef = useRef(0);
  const debouncedHandleObject = useDebouncedCallback(async (idRaw: string) => {
    if (!canEdit) return;
    const id = idRaw.trim();
    // Always patch the latest value (to keep graph in sync while typing)
    patchVar({ value: idRaw });

    // Empty value → clear typeTag and stop
    if (!id) {
      patchVar({ varType: { kind: 'object' } });
      setObjTypeLoading(false);
      return;
    }

    const seq = ++reqSeqRef.current; // guard against out-of-order responses
    try {
      setObjTypeLoading(true);
      const resp = await getObjectData(id, { forceRefresh: true });

      // Ignore stale response
      if (seq !== reqSeqRef.current) return;

      const moveType =
        resp?.content?.dataType === 'moveObject'
          ? (resp.content as any)?.type
          : undefined;

      if (moveType) {
        patchVar({ varType: { kind: 'object', typeTag: moveType } });
      } else {
        patchVar({ varType: { kind: 'object' } });
        adapters?.toast?.({
          message: 'Object not found or not a Move object.',
          variant: 'error',
        });
      }
    } catch (e: any) {
      if (seq !== reqSeqRef.current) return;
      patchVar({ varType: { kind: 'object' } });
      adapters?.toast?.({
        message: e?.message || 'Failed to fetch object metadata.',
        variant: 'error',
      });
    } finally {
      if (seq === reqSeqRef.current) setObjTypeLoading(false);
    }
  }, OBJECT_DEBOUNCE_MS);

  /** Out port (with optional human-friendly typeStr). */
  const outPort: Port = useMemo(() => buildOutPort(v), [v]);

  /** Show editor area? */
  const hasEditor = useMemo(() => !isHelper, [isHelper]);

  /** Stepper (+/-) — apply immediately and request RF bounds recompute. */
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
        patchVar({ value: next });
        requestAnimationFrame(() => updateNodeInternals(rfNodeId));
        return next;
      });
    },
    [canEdit, varType, patchVar, rfNodeId, updateNodeInternals],
  );

  /** Recompute bounds when height-affecting state toggles. */
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

  /** Read-only typeTag (copyable) for object variables. */
  const objectTypeTag =
    varType?.kind === 'object' ? (varType as any)?.typeTag : undefined;

  /** Helper: parse → boolean | undefined from string/boolean. */
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
          isHelper ? 'w-[140px]' : hasEditor ? 'w-[240px]' : 'w-[180px]',
          'min-w-[140px]',
        ].join(' ')}
      >
        {/* Header: icon (left) + vector stepper (right) */}
        <div className="flex items-center justify-between">
          <p className="flex items-center gap-1 text-xxs text-gray-800 dark:text-gray-200">
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

                  // vector<bool>: SelectBool (defer patch via rAF)
                  if (isBoolElem) {
                    const b = parseBool(val);
                    return (
                      <SelectBool
                        key={`vec-bool-${i}`}
                        value={b}
                        onChange={(newVal) => {
                          setVecItems((prev) => {
                            const next = prev.slice();
                            next[i] = newVal as boolean | undefined as any;
                            requestAnimationFrame(() =>
                              patchVar({ value: next }),
                            );
                            requestAnimationFrame(() =>
                              updateNodeInternals(rfNodeId),
                            );
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
                            requestAnimationFrame(() =>
                              updateNodeInternals(rfNodeId),
                            );
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
              // ===== Scalar<bool>: SelectBool =====
              <SelectBool
                value={(v as any)?.value as boolean | undefined}
                onChange={(val) => {
                  if (!canEdit) return;
                  requestAnimationFrame(() => patchVar({ value: val }));
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
                      // Debounced: patch value, fetch meta, patch varType
                      debouncedHandleObject(s);
                    } else {
                      // Debounced: patch scalar value only
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
}

export default React.memo(VarNode);
