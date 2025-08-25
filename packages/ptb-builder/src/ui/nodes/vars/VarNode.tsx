// src/ui/nodes/vars/VarNode.tsx
// Variable node with inline editors (except helper vars that are auto-provided).
// - Scalars: address/string/number → <input>, bool → <select> (default true if unset)
// - Object: object id <input> (value), typeTag <input> (blur to commit) + "Load" button (always visible; disabled if no handler)
// - Vectors (1-D): N text inputs + right-aligned mini stepper (＋/−) to change item count
// - Helpers (sender/wallet, gas, clock, system, random, sui[=0x2::sui::SUI]): label only, no editor
// - If no onPatchVar is provided, editors are read-only
// - No nulls: use undefined

import React, { useCallback, useEffect, useMemo, useState } from 'react';

import { type Node, type NodeProps, Position } from '@xyflow/react';
import {
  Binary,
  BookA,
  Calculator,
  Clock,
  Cog,
  Dices,
  Fuel,
  Mailbox,
  Wallet,
} from 'lucide-react';

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
import { IconSui } from '../icons/IconSui';
import { iconOfVar } from '../icons/varIcons';

export type VarData = {
  label?: string;
  ptbNode?: PTBNode;
  onPatchVar?: (nodeId: string, patch: Partial<VariableNode>) => void;
  onLoadTypeTag?: (typeTag: string) => void;
};
export type VarRFNode = Node<VarData, 'ptb-var'>;

export function VarNode({ data }: NodeProps<VarRFNode>) {
  const v = data?.ptbNode as VariableNode | undefined;
  const nodeId = v?.id;
  const varType = v?.varType;
  const canEdit = Boolean(nodeId && data?.onPatchVar);

  const { category } = ioShapeOf(varType);

  // helper detection
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

  // local buffers
  const [scalarBuf, setScalarBuf] = useState('');
  const [typeTagBuf, setTypeTagBuf] = useState('');
  const [vecItems, setVecItems] = useState<string[]>(['']); // min=1

  // sync from value & type
  useEffect(() => {
    if (!isVectorType(varType)) {
      setScalarBuf(
        (v as any)?.value == undefined ? '' : String((v as any)?.value),
      );
    } else {
      const raw = (v as any)?.value;
      if (Array.isArray(raw) && raw.length > 0) {
        setVecItems(raw.map((x) => String(x)));
      } else {
        setVecItems(['']);
      }
    }
    // object: load current typeTag
    if (varType?.kind === 'object') {
      setTypeTagBuf(varType.typeTag ?? '');
    } else {
      setTypeTagBuf('');
    }
  }, [nodeId, v, varType]);

  // bool default = true (once), editable & non-helper only
  useEffect(() => {
    if (!canEdit || isHelper) return;
    if (varType?.kind === 'scalar' && varType.name === 'bool') {
      const val = (v as any)?.value as boolean | undefined;
      if (typeof val === 'undefined' && data?.onPatchVar && nodeId) {
        data.onPatchVar(nodeId, { value: true });
      }
    }
  }, [canEdit, isHelper, varType, data, nodeId, v]);

  const patchVar = useCallback(
    (patch: Partial<VariableNode>) => {
      if (canEdit && nodeId && data?.onPatchVar) data.onPatchVar(nodeId, patch);
    },
    [canEdit, nodeId, data],
  );

  const outPort: Port = useMemo(() => buildOutPort(v), [v]);

  // editor availability
  const hasEditor = useMemo(() => !isHelper, [isHelper]);

  // vector stepper
  const stepVec = (delta: number) => {
    if (!canEdit) return;
    setVecItems((prev) => {
      const nextLen = Math.max(1, prev.length + delta);
      if (nextLen === prev.length) return prev;
      if (nextLen > prev.length) {
        return [
          ...prev,
          ...Array.from({ length: nextLen - prev.length }, () => ''),
        ];
      } else {
        return prev.slice(0, nextLen);
      }
    });
  };

  // commit helpers
  const commitScalar = () => {
    if (!canEdit) return;
    patchVar({ value: scalarBuf });
  };
  const commitObjectTypeTag = () => {
    if (!canEdit || varType?.kind !== 'object') return;
    const trimmed = typeTagBuf.trim() || undefined;
    patchVar({
      varType: trimmed
        ? { kind: 'object', typeTag: trimmed }
        : { kind: 'object' },
    });
  };
  const commitVector = () => {
    if (!canEdit || !isVectorType(varType)) return;
    // trim tail empties (keep min=1)
    const cleaned = [...vecItems].map((s) => s.trim());
    let lastNonEmpty = -1;
    cleaned.forEach((s, i) => {
      if (s.length > 0) lastNonEmpty = i;
    });
    const normalized =
      lastNonEmpty >= 0 ? cleaned.slice(0, lastNonEmpty + 1) : [''];
    patchVar({ value: normalized });
    setVecItems(normalized);
  };

  // title & icon
  const title = (data?.label ?? v?.label ?? 'variable').trim();
  const elemT = vectorElem(varType);
  const vecPlaceholder = placeholderFor(elemT);

  // on-chain type loader (always visible; may be disabled)
  const hasLoader = typeof data?.onLoadTypeTag === 'function';
  const loadTypeDisabled = !typeTagBuf.trim() || !canEdit || !hasLoader;

  return (
    <div className={`ptb-node--${category}`}>
      <div
        className={`ptb-node-shell rounded-lg w-[${isHelper ? '140px' : '180px'}] py-2 px-2 border-2 shadow relative`}
      >
        {/* Header with icon (left-aligned) */}
        <p className="flex items-center gap-1 text-sm text-gray-800 dark:text-gray-200">
          {iconOfVar(v, data?.label)}
          {title}
        </p>

        {/* Editors */}
        {!isHelper && (
          <>
            {isVectorType(varType) ? (
              <>
                <div className="space-y-1">
                  {vecItems.map((val, i) => (
                    <TextInput
                      key={`vec-${i}`}
                      value={val}
                      placeholder={`${vecPlaceholder} [${i}]`}
                      onChange={(e) => {
                        const vv = e.target.value;
                        setVecItems((prev) => {
                          const copy = prev.slice();
                          copy[i] = vv;
                          return copy;
                        });
                      }}
                      onBlur={commitVector}
                      disabled={!canEdit}
                    />
                  ))}
                </div>
                <div
                  className="mt-1 flex justify-end"
                  role="group"
                  aria-label="vector item count"
                >
                  <div className="inline-flex">
                    <button
                      type="button"
                      className="h-4 w-4 inline-flex items-center justify-center text-[10px] leading-none 
                                 bg-white text-gray-800 border border-gray-300 hover:bg-gray-100 
                                 dark:bg-stone-900 dark:text-gray-100 dark:border-stone-700 dark:hover:bg-stone-800 rounded-l"
                      onClick={() => stepVec(-1)}
                      disabled={!canEdit || vecItems.length <= 1}
                      title="Decrease items"
                    >
                      −
                    </button>
                    <button
                      type="button"
                      className="h-4 w-4 inline-flex items-center justify-center text-[10px] leading-none 
                                 bg-white text-gray-800 border border-gray-300 hover:bg-gray-100 -ml-px
                                 dark:bg-stone-900 dark:text-gray-100 dark:border-stone-700 dark:hover:bg-stone-800 rounded-r"
                      onClick={() => stepVec(+1)}
                      disabled={!canEdit}
                      title="Increase items"
                    >
                      ＋
                    </button>
                  </div>
                </div>
              </>
            ) : varType?.kind === 'scalar' && varType.name === 'bool' ? (
              <SelectBool
                value={(v as any)?.value as boolean | undefined}
                onChange={(val) => patchVar({ value: val })}
                disabled={!canEdit}
              />
            ) : varType?.kind === 'object' ? (
              <>
                {/* object id (value) */}
                <div className="mb-1">
                  <TextInput
                    value={
                      (v as any)?.value == undefined
                        ? ''
                        : String((v as any)?.value)
                    }
                    placeholder={placeholderFor(varType)}
                    onChange={(e) => setScalarBuf(e.target.value)}
                    onBlur={commitScalar}
                    disabled={!canEdit}
                  />
                </div>

                {/* typeTag + Load button (always render; disabled if no handler) */}
                <div className="flex items-center gap-2">
                  <div className="flex-1">
                    <TextInput
                      value={typeTagBuf}
                      onChange={(e) => setTypeTagBuf(e.target.value)}
                      placeholder="typeTag (optional)"
                      onBlur={commitObjectTypeTag}
                      disabled={!canEdit}
                    />
                  </div>
                  <div className="shrink-0">
                    <button
                      type="button"
                      className="px-2 py-1 text-[11px] border rounded bg-white dark:bg-stone-900 
                                 border-gray-300 dark:border-stone-700 text-gray-900 dark:text-gray-100 
                                 disabled:opacity-50"
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
              <TextInput
                value={scalarBuf}
                onChange={(e) => setScalarBuf(e.target.value)}
                onBlur={commitScalar}
                placeholder={placeholderFor(varType)}
                disabled={!canEdit}
              />
            )}
          </>
        )}

        {/* Out handle */}
        <PTBHandleIO port={outPort} position={Position.Right as Position} />
      </div>
    </div>
  );
}

export default React.memo(VarNode);
