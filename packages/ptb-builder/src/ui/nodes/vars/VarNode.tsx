// src/ui/nodes/vars/VarNode.tsx
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  type Node,
  type NodeProps,
  Position,
  useUpdateNodeInternals,
} from '@xyflow/react';
import { NULL_VALUE } from '@zktx.io/ptb-model';
import { Pencil } from 'lucide-react';

import { OptionToggle } from './inputs/OptionToggle';
import { SelectBool } from './inputs/SelectBool';
import { TextInput } from './inputs/TextInput';
import { buildOutPort, placeholderFor } from './varUtils';
import { VectorEditorModal } from './VectorEditorModal';
import { summarizeVectorValue, type VectorEditorItem } from './vectorValue';
import {
  ioCategoryOf,
  isOption as isOptionType,
  isVector as isVectorType,
  optionElem,
  vectorElem,
} from '../../../ptb/graph/typecheck';
import type { Port, PTBNode, VariableNode } from '../../../ptb/graph/types';
import { PTBHandleIO } from '../../handles/PTBHandleIO';
import {
  activeObjectMetadataInfo,
  createObjectMetadataState,
  displayObjectMetadataInfo,
  objectMetadataInputChanged,
  objectMetadataLookupFailed,
  objectMetadataLookupStarted,
  objectMetadataLookupSucceeded,
} from '../../objectMetadataState';
import { usePtb } from '../../PtbProvider';
import { iconOfVar } from '../icons';
import { NODE_SIZES } from '../nodeLayout';

const OPTION_NONE_VALUE = NULL_VALUE;

export type VarData = {
  label?: string;
  ptbNode?: PTBNode;
  onPatchVar?: (nodeId: string, patch: Partial<VariableNode>) => void;
};
export type VarRFNode = Node<VarData, 'ptb-var'>;

/** Post a function to the microtask queue (after current render). */
function defer(fn: () => void) {
  if (typeof queueMicrotask === 'function') queueMicrotask(fn);
  else Promise.resolve().then(fn);
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
  const { lookupObjectMetadata, readOnly, toast } = usePtb();
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Editability
  const canEdit = Boolean(nodeId && data?.onPatchVar) && !readOnly;
  const showAuthoringControls = !readOnly;

  // Visual category for node chrome
  const category = ioCategoryOf(varType);

  // NOTE: helpers have chrome-only visuals (no editor area & fixed labels).
  const isGasSemantic = v?.semantic?.kind === 'GasCoin';
  const isHelper = isGasSemantic;

  // Local UI buffers
  const [scalarBuf, setScalarBuf] = useState(''); // scalar & object id (also Option<T> inner)
  const [vectorEditorOpen, setVectorEditorOpen] = useState(false);
  const [optSome, setOptSome] = useState<boolean>(false); // Option<T> toggle
  const reqSeqRef = useRef(0);
  const [objectDraft, setObjectDraft] = useState(() =>
    createObjectMetadataState(''),
  );
  useEffect(() => {
    reqSeqRef.current += 1;
    setObjectDraft(createObjectMetadataState('', reqSeqRef.current));
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

    if (isVector) return;

    const s = val === undefined ? '' : String(val);
    setScalarBuf((prev) => (prev === s ? prev : s));
  }, [
    nodeId,
    variableValue,
    varType?.kind,
    rawObject?.objectId,
    isOption,
    isVector,
  ]);

  // Default scalar<bool>=true once (non-helper)
  useEffect(() => {
    if (!canEdit || isHelper || !isScalarBool) return;
    const val = variableValue as boolean | undefined;
    if (typeof val === 'undefined') patchVar({ value: true });
  }, [canEdit, isHelper, isScalarBool, variableValue, patchVar]);

  const objectInfo = displayObjectMetadataInfo(objectDraft);
  const activeObjectInfo = activeObjectMetadataInfo(objectDraft);
  const objTypeLoading = objectDraft.status === 'loading';
  const objectInfoMatchesInput = !!activeObjectInfo;
  const showObjectLoadButton = !readOnly && !objectInfoMatchesInput;
  const optionBoolValue = parseBoolEditorValue(variableValue ?? scalarBuf);

  // Object lookup loads authoring metadata only. Resolved raw references are
  // preserved only when they came from decoded raw/on-chain PTB data.
  const handleObjectLookup = useCallback(async () => {
    if (!canEdit) return;

    const id = scalarBuf.trim();
    patchVar({ value: scalarBuf, rawInput: undefined });

    if (!id) {
      const seq = ++reqSeqRef.current;
      setObjectDraft(createObjectMetadataState('', seq));
      patchVar({ varType: { kind: 'object' }, rawInput: undefined });
      return;
    }

    const seq = ++reqSeqRef.current;
    setObjectDraft((prev) => objectMetadataLookupStarted(prev, id, seq));
    try {
      const resp = await lookupObjectMetadata(id);
      if (seq !== reqSeqRef.current) return;

      if (!resp.ok) {
        setObjectDraft((prev) =>
          objectMetadataLookupFailed(prev, seq, resp.error),
        );
        patchVar({ varType: { kind: 'object' }, rawInput: undefined });
        toast?.({
          message: resp.error,
          variant: 'error',
        });
        return;
      }

      setObjectDraft((prev) =>
        objectMetadataLookupSucceeded(prev, seq, resp.object),
      );
      setScalarBuf(resp.object.objectId);
      patchVar({
        value: resp.object.objectId,
        varType: { kind: 'object', typeTag: resp.object.typeTag },
        rawInput: undefined,
      });
    } catch (e: any) {
      if (seq !== reqSeqRef.current) return;
      const message = e?.message || 'Failed to load object metadata.';
      setObjectDraft((prev) => objectMetadataLookupFailed(prev, seq, message));
      patchVar({ varType: { kind: 'object' }, rawInput: undefined });
      toast?.({
        message,
        variant: 'error',
      });
    }
  }, [canEdit, lookupObjectMetadata, patchVar, scalarBuf, toast]);

  // Port
  const outPort: Port = useMemo(() => buildOutPort(v), [v]);

  // For layout
  const hasEditor = useMemo(() => !isHelper, [isHelper]);

  // Refresh internals on height-affecting changes
  useEffect(() => {
    requestInternals();
  }, [rfNodeId, hasEditor, isVector, isOption, optSome, requestInternals]);

  const title = (data?.label ?? v?.label ?? '').trim() || 'variable';
  const nodeClassName = isOption
    ? `ptb-node--${category} ptb-node--option`
    : `ptb-node--${category}`;
  const vectorSummary = useMemo(
    () => summarizeVectorValue(variableValue),
    [variableValue],
  );
  const vectorSummaryLabel =
    vectorSummary.count === undefined
      ? vectorSummary.state === 'invalid'
        ? 'invalid'
        : 'unset'
      : `${vectorSummary.count} item${vectorSummary.count === 1 ? '' : 's'}`;
  const applyVectorValue = useCallback(
    (nextValue: VectorEditorItem[]) => {
      if (!canEdit || !isVector) return;
      patchVar({ value: nextValue });
      requestInternals();
    },
    [canEdit, isVector, patchVar, requestInternals],
  );

  const renderVectorPreview = () => (
    <div className="rounded border border-gray-300 bg-white px-2 py-1 text-xs text-gray-900 dark:border-stone-700 dark:bg-stone-900 dark:text-gray-100">
      <div className="flex min-w-0 items-center justify-between gap-2 text-[10px] leading-tight text-gray-500 dark:text-gray-400">
        <span className="min-w-0 truncate">{vectorSummaryLabel}</span>
        {vectorSummary.remaining > 0 ? (
          <span className="shrink-0 rounded bg-gray-100 px-1 py-0.5 font-mono tabular-nums text-gray-700 dark:bg-stone-800 dark:text-gray-200">
            +{vectorSummary.remaining} more
          </span>
        ) : undefined}
      </div>
      <div
        className="mt-1 overflow-hidden text-ellipsis whitespace-nowrap font-mono"
        title={vectorSummary.title}
      >
        {vectorSummary.preview}
      </div>
    </div>
  );

  // Option input derived UI
  const optionInputDisabled = isOption && (!optSome || !canEdit);
  const optionInputPlaceholder = isOption
    ? optSome
      ? placeholderFor(optionInner)
      : 'none'
    : '';

  return (
    <>
      <div className={nodeClassName}>
        <div
          className="ptb-node-shell rounded-lg py-2 px-2 border-2 shadow relative"
          style={{
            minWidth: 140,
            width: isHelper
              ? NODE_SIZES.Helper.width
              : NODE_SIZES.Variable.width,
          }}
        >
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1 text-xxs text-gray-800 dark:text-gray-200">
              {iconOfVar(v)}
              {title}
            </div>

            {showAuthoringControls && !isHelper && (isVector || isOption) ? (
              <div className="flex items-center gap-1">
                {isVector && (
                  <button
                    type="button"
                    className="inline-flex h-5 w-5 items-center justify-center rounded border border-gray-300 bg-white text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-stone-700 dark:bg-stone-900 dark:text-gray-200 dark:hover:bg-stone-800"
                    disabled={!canEdit}
                    onClick={() => setVectorEditorOpen(true)}
                    aria-label="Edit vector"
                    title="Edit vector"
                  >
                    <Pencil size={11} strokeWidth={2.25} />
                  </button>
                )}

                {/* iOS-style option toggle */}
                {isOption && (
                  <OptionToggle
                    some={optSome}
                    disabled={!canEdit}
                    onToggle={(next) => {
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
            ) : undefined}
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
                      patchVar({ value: s });
                    }}
                    disabled={optionInputDisabled}
                  />
                )
              ) : isVector ? (
                // ===== Vector<T> =====
                renderVectorPreview()
              ) : isScalarBool ? (
                // ===== Scalar<bool> (non-option) =====
                <SelectBool
                  value={variableValue as boolean | undefined}
                  onChange={(val) => {
                    if (!canEdit) return;
                    patchVar({ value: val });
                  }}
                  disabled={!canEdit}
                />
              ) : (
                // ===== Scalar & Object (top-level only) =====
                <>
                  <div className="flex gap-1">
                    <TextInput
                      className="min-w-0 flex-1"
                      value={scalarBuf}
                      placeholder={placeholderFor(varType)}
                      aria-label="Variable value"
                      onChange={(e) => {
                        const s = e.target.value;
                        setScalarBuf(s);
                        if (!canEdit) return;

                        if (varType?.kind === 'object') {
                          const seq = ++reqSeqRef.current;
                          setObjectDraft((prev) =>
                            objectMetadataInputChanged(prev, s, seq),
                          );
                          patchVar({
                            value: s,
                            rawInput: undefined,
                          });
                        } else {
                          patchVar({ value: s });
                        }
                      }}
                      disabled={!canEdit}
                    />
                    {varType?.kind === 'object' ? (
                      <>
                        {showObjectLoadButton && (
                          <button
                            type="button"
                            className="px-2 py-1 text-xxs border rounded bg-white dark:bg-stone-900 border-gray-300 dark:border-stone-700 text-gray-900 dark:text-gray-100 disabled:opacity-50"
                            disabled={
                              !canEdit || objTypeLoading || !scalarBuf.trim()
                            }
                            onClick={handleObjectLookup}
                            aria-busy={objTypeLoading}
                          >
                            Load
                          </button>
                        )}
                      </>
                    ) : undefined}
                  </div>
                  {varType?.kind === 'object' ? (
                    <div className="mt-1 space-y-1">
                      {varType.typeTag || objTypeLoading ? (
                        <TextInput
                          value={varType.typeTag || ''}
                          placeholder={
                            objTypeLoading ? 'Loading type...' : 'object type'
                          }
                          aria-label="Object type"
                          readOnly
                          aria-readonly="true"
                          onChange={() => {}}
                        />
                      ) : undefined}

                      {objectInfo ? (
                        !readOnly && !objectInfoMatchesInput ? (
                          <div className="text-[10px] leading-tight text-amber-700 dark:text-amber-300">
                            Load object metadata to refresh this object.
                          </div>
                        ) : undefined
                      ) : !readOnly && objectDraft.status === 'error' ? (
                        <div className="text-[10px] leading-tight text-amber-700 dark:text-amber-300">
                          {objectDraft.error || 'Object metadata load failed.'}
                        </div>
                      ) : rawObject ? (
                        <div className="text-[10px] leading-tight text-gray-600 dark:text-gray-400">
                          Resolved object reference preserved from decoded PTB
                          data.
                        </div>
                      ) : !readOnly ? (
                        <div className="text-[10px] leading-tight text-gray-500 dark:text-gray-500">
                          Load object metadata before executing object inputs.
                        </div>
                      ) : undefined}
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
      <VectorEditorModal
        elemType={vecElem}
        onApply={applyVectorValue}
        onClose={() => setVectorEditorOpen(false)}
        open={vectorEditorOpen}
        title={title}
        value={variableValue}
      />
    </>
  );
});

export default VarNode;
