// src/ui/nodes/vars/VarNode.tsx
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  type Node,
  type NodeProps,
  Position,
  useUpdateNodeInternals,
} from '@xyflow/react';
import { NULL_VALUE } from '@zktx.io/ptb-model';

import { MiniStepper } from './inputs/MiniStepper';
import { OptionToggle } from './inputs/OptionToggle';
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
import {
  buildObjectRawInputForUsage,
  defaultObjectRawUsage,
  type ObjectRawUsage,
} from '../../../ptb/objectAuthoring';
import {
  createDebouncedCallbackController,
  type DebouncedCallbackController,
} from '../../debouncedCallback';
import { PTBHandleIO } from '../../handles/PTBHandleIO';
import {
  activeObjectAuthoringInfo,
  canSelectObjectRawUsage,
  createObjectAuthoringState,
  displayObjectAuthoringInfo,
  objectAuthoringInputChanged,
  objectAuthoringLookupFailed,
  objectAuthoringLookupStarted,
  objectAuthoringLookupSucceeded,
  unsupportedObjectAuthoringReason,
} from '../../objectAuthoringState';
import { usePtb } from '../../PtbProvider';
import { iconOfVar } from '../icons';
import { NODE_SIZES } from '../nodeLayout';

const DEBOUNCE_MS = 250;
const OPTION_NONE_VALUE = NULL_VALUE;
type VectorEditorItem = string | boolean;

export type VarData = {
  label?: string;
  ptbNode?: PTBNode;
  onPatchVar?: (nodeId: string, patch: Partial<VariableNode>) => void;
};
export type VarRFNode = Node<VarData, 'ptb-var'>;

/** Debounced-callback helper (cleans up on unmount). */
function useDebouncedCallback<T extends any[]>(
  fn: (...args: T) => void,
  delay = DEBOUNCE_MS,
) {
  const fnRef = useRef(fn);
  const mountedRef = useRef(true);
  const delayRef = useRef(delay);
  useEffect(() => {
    fnRef.current = fn;
  }, [fn]);
  const controllerRef = useRef<DebouncedCallbackController<T> | undefined>(
    undefined,
  );
  const ensureController = useCallback(() => {
    if (controllerRef.current) return controllerRef.current;
    controllerRef.current = createDebouncedCallbackController<T>({
      delayMs: delayRef.current,
      invoke: (...args) => {
        if (mountedRef.current) fnRef.current(...args);
      },
    });
    return controllerRef.current;
  }, []);
  useEffect(() => {
    delayRef.current = delay;
    controllerRef.current?.setDelay(delay);
  }, [delay]);
  const cancel = useCallback(() => {
    controllerRef.current?.cancel();
  }, []);
  const flush = useCallback(() => {
    controllerRef.current?.flush();
  }, []);
  useEffect(() => {
    mountedRef.current = true;
    ensureController();
    return () => {
      mountedRef.current = false;
      controllerRef.current?.dispose();
      controllerRef.current = undefined;
    };
  }, [ensureController]);
  const schedule = useCallback(
    (...args: T) => {
      ensureController().schedule(...args);
    },
    [ensureController],
  );
  return useMemo(
    () => ({ schedule, cancel, flush }),
    [schedule, cancel, flush],
  );
}

/** Post a function to the microtask queue (after current render). */
function defer(fn: () => void) {
  if (typeof queueMicrotask === 'function') queueMicrotask(fn);
  else Promise.resolve().then(fn);
}

function shortMiddle(value: string, left = 8, right = 6): string {
  if (!value) return '';
  if (value.length <= left + right + 3) return value;
  return `${value.slice(0, left)}…${value.slice(-right)}`;
}

function parseBoolEditorValue(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') return value;
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim().toLowerCase();
  if (normalized === 'true') return true;
  if (normalized === 'false') return false;
  return undefined;
}

function objectIdFromEditorValue(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object') {
    const objectId = (value as { objectId?: unknown }).objectId;
    return typeof objectId === 'string' ? objectId : undefined;
  }
  return undefined;
}

export const VarNode = memo(function VarNode({
  id: rfNodeId,
  data,
}: NodeProps<VarRFNode>) {
  const v = data?.ptbNode as VariableNode | undefined;
  const nodeId = v?.id;
  const varType = v?.varType;
  const variableValue = v?.value;

  const updateNodeInternals = useUpdateNodeInternals();
  const { lookupObjectForAuthoring, readOnly, toast } = usePtb();
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Editability
  const canEdit = Boolean(nodeId && data?.onPatchVar) && !readOnly;

  // Visual category for node chrome
  const category = ioCategoryOf(varType);

  // NOTE: helpers have chrome-only visuals (no editor area & fixed labels).
  const isGasSemantic = v?.semantic?.kind === 'GasCoin';
  const isHelper = isGasSemantic;

  // Local UI buffers
  const [scalarBuf, setScalarBuf] = useState(''); // scalar & object id (also Option<T> inner)
  const [vecItems, setVecItems] = useState<VectorEditorItem[]>(['']); // vector<T> editor
  const vecItemsRef = useRef<VectorEditorItem[]>(['']);
  const [optSome, setOptSome] = useState<boolean>(false); // Option<T> toggle
  const reqSeqRef = useRef(0);
  const [objectDraft, setObjectDraft] = useState(() =>
    createObjectAuthoringState(''),
  );
  useEffect(() => {
    reqSeqRef.current += 1;
    setObjectDraft(createObjectAuthoringState('', reqSeqRef.current));
  }, [nodeId]);

  // Patcher
  const patchVar = useCallback(
    (patch: Partial<VariableNode>) => {
      if (!canEdit || !nodeId || !data?.onPatchVar) return;
      defer(() => {
        if (!mountedRef.current) return;
        data.onPatchVar!(nodeId, patch);
      });
    },
    [canEdit, nodeId, data],
  );

  // Layout refresh
  const requestInternals = useCallback(() => {
    if (!rfNodeId) return;
    requestAnimationFrame(() => updateNodeInternals(rfNodeId));
  }, [rfNodeId, updateNodeInternals]);

  // Array shallow-eq
  const arrShallowEqual = useCallback(
    (a: VectorEditorItem[], b: VectorEditorItem[]) => {
      if (a === b) return true;
      if (a.length !== b.length) return false;
      for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
      return true;
    },
    [],
  );
  const replaceVectorItems = useCallback((next: VectorEditorItem[]) => {
    vecItemsRef.current = next;
    setVecItems(next);
  }, []);

  // Derived flags for minimal branching
  const isOption = isOptionType(varType);
  const isVector = isVectorType(varType);
  const isScalarBool = varType?.kind === 'scalar' && varType.name === 'bool';

  const optionInner = useMemo(
    () => (isOption ? optionElem(varType) : undefined),
    [isOption, varType],
  );
  const optionInnerIsBool =
    optionInner?.kind === 'scalar' && optionInner.name === 'bool';
  const vecElem = useMemo(
    () => (isVector ? vectorElem(varType) : undefined),
    [isVector, varType],
  );
  const vecElemIsBool = vecElem?.kind === 'scalar' && vecElem.name === 'bool';
  const rawObject =
    v?.rawInput?.kind === 'Object' ? v.rawInput.object : undefined;

  // Sync buffers from graph → keep previous buffer when option is None
  useEffect(() => {
    const val = variableValue;

    if (varType?.kind === 'object') {
      const s = rawObject?.objectId ?? objectIdFromEditorValue(val) ?? '';
      setScalarBuf((prev) => (prev === s ? prev : s));
      return;
    }

    if (isOption) {
      const isNone = val === OPTION_NONE_VALUE;
      setOptSome(!isNone);
      if (!isNone) {
        const s = String(val ?? '');
        setScalarBuf((prev) => (prev === s ? prev : s));
      }
      return;
    }

    if (isVector) {
      const arr: VectorEditorItem[] =
        Array.isArray(val) && val.length > 0
          ? val.map((item) =>
              vecElemIsBool
                ? (parseBoolEditorValue(item) ?? String(item))
                : String(item),
            )
          : [''];
      if (!arrShallowEqual(vecItemsRef.current, arr)) {
        replaceVectorItems(arr);
      }
      return;
    }

    const s = val === undefined ? '' : String(val);
    setScalarBuf((prev) => (prev === s ? prev : s));
  }, [
    nodeId,
    variableValue,
    varType?.kind,
    rawObject?.objectId,
    isOption,
    isVector,
    vecElemIsBool,
    arrShallowEqual,
    replaceVectorItems,
  ]);

  // Default scalar<bool>=true once (non-helper)
  useEffect(() => {
    if (!canEdit || isHelper || !isScalarBool) return;
    const val = variableValue as boolean | undefined;
    if (typeof val === 'undefined') patchVar({ value: true });
  }, [canEdit, isHelper, isScalarBool, variableValue, patchVar]);

  // Debounced patchers
  const debouncedPatchScalar = useDebouncedCallback((val: string) => {
    patchVar({ value: val });
  });
  const debouncedPatchVector = useDebouncedCallback(
    (vals: VectorEditorItem[]) => {
      patchVar({ value: vals });
    },
  );
  const cancelPendingPureValueDrafts = useCallback(() => {
    debouncedPatchScalar.cancel();
    debouncedPatchVector.cancel();
  }, [debouncedPatchScalar, debouncedPatchVector]);

  const currentObjectUsage: ObjectRawUsage | '' =
    rawObject?.kind === 'ImmOrOwnedObject'
      ? 'object-ref'
      : rawObject?.kind === 'Receiving'
        ? 'receiving'
        : rawObject?.kind === 'SharedObject'
          ? rawObject.mutable
            ? 'shared-mutable'
            : 'shared-readonly'
          : '';
  const objectInfo = displayObjectAuthoringInfo(objectDraft);
  const activeObjectInfo = activeObjectAuthoringInfo(objectDraft);
  const canSelectObjectUsage = canSelectObjectRawUsage(objectDraft);
  const objTypeLoading = objectDraft.status === 'loading';
  const objectInfoMatchesInput = !!activeObjectInfo;
  const unsupportedOwnerMessage = unsupportedObjectAuthoringReason(objectInfo);
  const optionBoolValue = parseBoolEditorValue(variableValue ?? scalarBuf);

  // Explicit object lookup: user input changes only edit the object id; raw
  // ObjectRef data is attached only after a lookup result and usage choice.
  const handleObjectLookup = useCallback(async () => {
    if (!canEdit) return;

    const id = scalarBuf.trim();
    cancelPendingPureValueDrafts();
    patchVar({ value: scalarBuf, rawInput: undefined });

    if (!id) {
      const seq = ++reqSeqRef.current;
      setObjectDraft(createObjectAuthoringState('', seq));
      patchVar({ varType: { kind: 'object' }, rawInput: undefined });
      return;
    }

    const seq = ++reqSeqRef.current;
    setObjectDraft((prev) => objectAuthoringLookupStarted(prev, id, seq));
    try {
      const resp = await lookupObjectForAuthoring(id);
      if (seq !== reqSeqRef.current) return;

      if (!resp.ok) {
        setObjectDraft((prev) =>
          objectAuthoringLookupFailed(prev, seq, resp.error),
        );
        patchVar({ varType: { kind: 'object' }, rawInput: undefined });
        toast?.({
          message: resp.error,
          variant: 'error',
        });
        return;
      }

      setObjectDraft((prev) =>
        objectAuthoringLookupSucceeded(prev, seq, resp.object),
      );
      setScalarBuf(resp.object.objectId);

      const usage = defaultObjectRawUsage(resp.object);
      const rawInput = usage
        ? buildObjectRawInputForUsage(resp.object, usage)
        : undefined;
      if (rawInput && !rawInput.ok) {
        toast?.({ message: rawInput.error, variant: 'warning' });
      }
      const nextRawInput = rawInput?.ok ? rawInput.rawInput : undefined;
      patchVar({
        value:
          nextRawInput?.kind === 'Object'
            ? nextRawInput.object
            : resp.object.objectId,
        varType: { kind: 'object', typeTag: resp.object.typeTag },
        rawInput: nextRawInput,
      });
    } catch (e: any) {
      if (seq !== reqSeqRef.current) return;
      const message = e?.message || 'Failed to look up object metadata.';
      setObjectDraft((prev) => objectAuthoringLookupFailed(prev, seq, message));
      patchVar({ varType: { kind: 'object' }, rawInput: undefined });
      toast?.({
        message,
        variant: 'error',
      });
    }
  }, [
    canEdit,
    cancelPendingPureValueDrafts,
    lookupObjectForAuthoring,
    patchVar,
    scalarBuf,
    toast,
  ]);

  const handleObjectUsageChange = useCallback(
    (usage: ObjectRawUsage | '') => {
      if (!canEdit) return;
      cancelPendingPureValueDrafts();
      const resolved = activeObjectAuthoringInfo(objectDraft);
      if (!resolved) {
        patchVar({ rawInput: undefined });
        toast?.({
          message:
            'Run Lookup to refresh object metadata before choosing usage.',
          variant: 'warning',
        });
        return;
      }
      if (!usage) {
        patchVar({ value: resolved.objectId, rawInput: undefined });
        return;
      }
      const rawInput = buildObjectRawInputForUsage(resolved, usage);
      if (!rawInput.ok) {
        patchVar({ rawInput: undefined });
        toast?.({ message: rawInput.error, variant: 'warning' });
        return;
      }
      const nextRawInput = rawInput.rawInput;
      if (!nextRawInput || nextRawInput.kind !== 'Object') {
        patchVar({ value: resolved.objectId, rawInput: undefined });
        return;
      }
      patchVar({
        value: nextRawInput.object,
        varType: { kind: 'object', typeTag: resolved.typeTag },
        rawInput: nextRawInput,
      });
    },
    [canEdit, cancelPendingPureValueDrafts, objectDraft, patchVar, toast],
  );

  // Port
  const outPort: Port = useMemo(() => buildOutPort(v), [v]);

  // For layout
  const hasEditor = useMemo(() => !isHelper, [isHelper]);

  // Vector stepper
  const stepVec = useCallback(
    (delta: number) => {
      if (!canEdit || !isVector) return;
      cancelPendingPureValueDrafts();
      const prev = vecItemsRef.current;
      const nextLen = Math.max(1, prev.length + delta);
      const next =
        nextLen > prev.length
          ? [
              ...prev,
              ...Array.from({ length: nextLen - prev.length }, () => ''),
            ]
          : prev.slice(0, nextLen);
      replaceVectorItems(next);
      patchVar({ value: next });
      requestInternals();
    },
    [
      canEdit,
      cancelPendingPureValueDrafts,
      isVector,
      patchVar,
      replaceVectorItems,
      requestInternals,
    ],
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

  const title = (data?.label ?? v?.label ?? '').trim() || 'variable';
  const nodeClassName = isOption
    ? `ptb-node--${category} ptb-node--option`
    : `ptb-node--${category}`;

  // Render vector editor
  const renderVectorEditor = (elemT = vectorElem(varType)) => {
    const isBoolElem = elemT?.kind === 'scalar' && elemT.name === 'bool';
    return (
      <div className="space-y-1">
        {vecItems.map((val, i) => {
          if (isBoolElem) {
            const b = parseBoolEditorValue(val);
            return (
              <SelectBool
                key={`vec-bool-${i}`}
                value={b}
                allowUnset
                onChange={(newVal) => {
                  cancelPendingPureValueDrafts();
                  const next = vecItemsRef.current.slice();
                  next[i] = newVal;
                  replaceVectorItems(next);
                  patchVar({ value: next });
                  requestInternals();
                }}
                onUnset={() => {
                  cancelPendingPureValueDrafts();
                  const next = vecItemsRef.current.slice();
                  next[i] = '';
                  replaceVectorItems(next);
                  patchVar({ value: next });
                  requestInternals();
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
              aria-label={`Vector item ${i}`}
              onChange={(e) => {
                const vv = e.target.value;
                const next = vecItemsRef.current.slice();
                next[i] = vv;
                replaceVectorItems(next);
                if (canEdit) {
                  debouncedPatchVector.schedule(next);
                  requestInternals();
                }
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
    <div className={nodeClassName}>
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
            {iconOfVar(v)}
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
                  cancelPendingPureValueDrafts();
                  setOptSome(next);
                  if (optionInnerIsBool) {
                    const nextValue = optionBoolValue ?? true;
                    if (next) setScalarBuf(String(nextValue));
                    patchVar({
                      value: next ? nextValue : OPTION_NONE_VALUE,
                    });
                  } else {
                    patchVar({
                      value: next ? scalarBuf : OPTION_NONE_VALUE,
                    });
                  }
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
              optionInnerIsBool ? (
                <SelectBool
                  value={optionBoolValue}
                  onChange={(val) => {
                    setScalarBuf(String(val));
                    if (canEdit && optSome) {
                      cancelPendingPureValueDrafts();
                      patchVar({ value: val });
                    }
                  }}
                  disabled={optionInputDisabled}
                />
              ) : (
                <TextInput
                  value={scalarBuf}
                  placeholder={optionInputPlaceholder}
                  aria-label="Option value"
                  onChange={(e) => {
                    const s = e.target.value;
                    setScalarBuf(s);
                    if (!canEdit || !optSome) return;
                    debouncedPatchScalar.schedule(s);
                  }}
                  disabled={optionInputDisabled}
                />
              )
            ) : isVector ? (
              // ===== Vector<T> =====
              renderVectorEditor(vecElem)
            ) : isScalarBool ? (
              // ===== Scalar<bool> (non-option) =====
              <SelectBool
                value={variableValue as boolean | undefined}
                onChange={(val) => {
                  if (!canEdit) return;
                  cancelPendingPureValueDrafts();
                  patchVar({ value: val });
                }}
                disabled={!canEdit}
              />
            ) : (
              // ===== Scalar & Object (top-level only) =====
              <>
                <TextInput
                  value={scalarBuf}
                  placeholder={placeholderFor(varType)}
                  aria-label="Variable value"
                  onChange={(e) => {
                    const s = e.target.value;
                    setScalarBuf(s);
                    if (!canEdit) return;

                    if (varType?.kind === 'object') {
                      const seq = ++reqSeqRef.current;
                      cancelPendingPureValueDrafts();
                      setObjectDraft((prev) =>
                        objectAuthoringInputChanged(prev, s, seq),
                      );
                      patchVar({
                        value: s,
                        rawInput: undefined,
                      });
                    } else {
                      debouncedPatchScalar.schedule(s);
                    }
                  }}
                  disabled={!canEdit}
                />
                {varType?.kind === 'object' ? (
                  <div className="mt-1 space-y-1">
                    <div className="flex gap-1">
                      <TextInput
                        value={varType.typeTag || ''}
                        placeholder={
                          objTypeLoading ? 'Loading type…' : 'type (read-only)'
                        }
                        aria-label="Object type"
                        readOnly
                        aria-readonly="true"
                        onChange={() => {}}
                      />
                      <button
                        type="button"
                        className="px-2 py-1 text-xxs border rounded bg-white dark:bg-stone-900 border-gray-300 dark:border-stone-700 disabled:opacity-50"
                        disabled={
                          !canEdit || objTypeLoading || !scalarBuf.trim()
                        }
                        onClick={handleObjectLookup}
                      >
                        {objTypeLoading ? 'Lookup…' : 'Lookup'}
                      </button>
                    </div>

                    {objectInfo ? (
                      <div className="text-[10px] leading-tight text-gray-600 dark:text-gray-400">
                        <div>
                          Owner: {objectInfo.ownerKind}
                          {objectInfo.ownerLabel
                            ? ` (${objectInfo.ownerLabel})`
                            : ''}
                        </div>
                        <div>Version: {objectInfo.version}</div>
                        <div>Digest: {shortMiddle(objectInfo.digest)}</div>
                        {!objectInfoMatchesInput && (
                          <div className="text-amber-700 dark:text-amber-300">
                            Run Lookup to refresh object metadata.
                          </div>
                        )}
                        {unsupportedOwnerMessage && (
                          <div className="text-amber-700 dark:text-amber-300">
                            {unsupportedOwnerMessage}
                          </div>
                        )}
                        <select
                          className="mt-1 w-full px-2 py-1 text-xxs border rounded bg-white dark:bg-stone-900 border-gray-300 dark:border-stone-700 text-gray-900 dark:text-gray-100"
                          value={currentObjectUsage}
                          disabled={!canEdit || !canSelectObjectUsage}
                          onChange={(e) =>
                            handleObjectUsageChange(
                              e.target.value as ObjectRawUsage | '',
                            )
                          }
                        >
                          <option value="">No raw object input</option>
                          <option
                            value="object-ref"
                            disabled={
                              objectInfo.ownerKind === 'Shared' ||
                              objectInfo.ownerKind ===
                                'ConsensusAddressOwner' ||
                              objectInfo.ownerKind === 'Unknown'
                            }
                          >
                            Use as object ref
                          </option>
                          <option
                            value="receiving"
                            disabled={
                              objectInfo.ownerKind === 'Shared' ||
                              objectInfo.ownerKind ===
                                'ConsensusAddressOwner' ||
                              objectInfo.ownerKind === 'Unknown'
                            }
                          >
                            Use as receiving
                          </option>
                          <option
                            value="shared-readonly"
                            disabled={objectInfo.ownerKind !== 'Shared'}
                          >
                            Use as shared read-only
                          </option>
                          <option
                            value="shared-mutable"
                            disabled={objectInfo.ownerKind !== 'Shared'}
                          >
                            Use as shared mutable
                          </option>
                        </select>
                      </div>
                    ) : objectDraft.status === 'error' ? (
                      <div className="text-[10px] leading-tight text-amber-700 dark:text-amber-300">
                        {objectDraft.error || 'Object lookup failed.'}
                      </div>
                    ) : currentObjectUsage ? (
                      <div className="text-[10px] leading-tight text-gray-600 dark:text-gray-400">
                        Raw input: {currentObjectUsage}. Run Lookup to refresh
                        object metadata.
                      </div>
                    ) : (
                      <div className="text-[10px] leading-tight text-gray-500 dark:text-gray-500">
                        Run Lookup before executing object inputs.
                      </div>
                    )}
                  </div>
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
