// src/ui/nodes/cmds/MoveCallCommand/MoveCallCommand.tsx
import React, { memo, useCallback, useEffect, useState } from 'react';

import type { Node, NodeProps } from '@xyflow/react';
import { Position } from '@xyflow/react';

import type { CommandNode, PTBNode } from '../../../../ptb/graph/types';
import { PTBHandleFlow } from '../../../handles/PTBHandleFlow';
import { PTBHandleIO } from '../../../handles/PTBHandleIO';
import { usePtb } from '../../../PtbProvider';
import { iconOfCommand } from '../../icons';
import {
  BOTTOM_PADDING,
  FLOW_TOP,
  ioTopForIndex,
  NODE_SIZES,
  ROW_SPACING,
  TITLE_TO_IO_GAP,
} from '../../nodeLayout';
import { TextInput } from '../../vars/inputs/TextInput';
import { labelOf, useCommandPorts } from '../commandLayout';

/** Compute min-height including the fixed controls offset so the shell never clips. */
function minHeightWithOffset(inCount: number, outCount: number) {
  const MVC_CONTROL_ROWS = 4; // package, module, function, and status rows
  const MVC_EXTRA_GAP = 24; // small padding under controls
  const MVC_IO_OFFSET = MVC_CONTROL_ROWS * ROW_SPACING + MVC_EXTRA_GAP;

  const rowCount = Math.max(inCount, outCount);
  if (rowCount === 0) return BOTTOM_PADDING;
  const gaps = Math.max(0, rowCount - 1);
  return TITLE_TO_IO_GAP + MVC_IO_OFFSET + gaps * ROW_SPACING + BOTTOM_PADDING;
}

export type MoveCallData = {
  label?: string;
  ptbNode?: PTBNode;
  onPatchUI?: (nodeId: string, patch: Record<string, unknown>) => void;
};

export type MoveCallRFNode = Node<MoveCallData, 'ptb-mvc'>;

function splitMoveCallTarget(
  target: unknown,
): { pkgId: string; moduleName: string; functionName: string } | undefined {
  if (typeof target !== 'string') return undefined;
  const [pkgId, moduleName, functionName, extra] = target.split('::');
  if (!pkgId || !moduleName || !functionName || extra !== undefined) {
    return undefined;
  }
  return { pkgId, moduleName, functionName };
}

export const MoveCallCommand = memo(function MoveCallCommand({
  data,
}: NodeProps<MoveCallRFNode>) {
  const node = data?.ptbNode as CommandNode | undefined;
  const ui = ((node?.params?.ui ?? {}) as any) || {};
  const runtime = ((node?.params?.runtime ?? {}) as any) || {};
  const target = splitMoveCallTarget(runtime.target);
  const pkgIdValue = ui.pkgId ?? target?.pkgId ?? '';
  const moduleValue = ui.module ?? target?.moduleName ?? '';
  const functionValue = ui.func ?? target?.functionName ?? '';

  const { getMoveFunction, toast, readOnly } = usePtb();

  // Local buffers avoid graph writes while typing an unresolved target.
  const [pkgIdBuf, setPkgIdBuf] = useState<string>(pkgIdValue);
  const [moduleBuf, setModuleBuf] = useState<string>(moduleValue);
  const [funcBuf, setFuncBuf] = useState<string>(functionValue);
  const [loading, setLoading] = useState(false);

  // Ports (already materialized by registry; we only render them).
  const { inIO, outIO } = useCommandPorts(node);

  // Min-height accounts for IO rows plus the fixed controls offset.
  const minHeight = minHeightWithOffset(inIO.length, outIO.length);
  const ioOffset = 4 * ROW_SPACING + 24;

  // Patch helper → merge into node.params.ui (provider re-materializes ports & prunes edges).
  const patchUI = useCallback(
    (patch: Record<string, unknown>) => {
      if (!node?.id || !data?.onPatchUI) return;
      data.onPatchUI(node.id, patch);
    },
    [data, node?.id],
  );

  // Keep the local pkg input buffer in sync when external UI state changes.
  useEffect(() => {
    setPkgIdBuf(pkgIdValue);
    setModuleBuf(moduleValue);
    setFuncBuf(functionValue);
  }, [functionValue, moduleValue, pkgIdValue]);

  const resolveFunction = useCallback(async () => {
    const pkg = (pkgIdBuf || '').trim();
    const mod = (moduleBuf || '').trim();
    const fn = (funcBuf || '').trim();
    if (!pkg || !mod || !fn || !node?.id) return;

    try {
      setLoading(true);
      const result = await getMoveFunction(pkg, mod, fn, {
        forceRefresh: true,
      });
      if (!result) return;

      const sig = result.signature;
      const existingTParams = Array.isArray(ui._fnTParams)
        ? (ui._fnTParams as string[])
        : [];
      const _fnTParams = Array.from(
        { length: sig.tparamCount },
        (_value, index) => existingTParams[index] ?? '',
      );

      patchUI({
        pkgId: result.packageId,
        module: result.moduleName,
        func: result.functionName,
        pkgLocked: undefined,
        _nameModules_: undefined,
        _moduleFunctions_: undefined,
        _fnSigs_: undefined,
        _fnTParams,
        _fnIns: sig.ins,
        _fnOuts: sig.outs,
      });

      setPkgIdBuf(result.packageId);
      setModuleBuf(result.moduleName);
      setFuncBuf(result.functionName);
      toast?.({ message: 'Move function resolved', variant: 'success' });
    } catch (e: any) {
      toast?.({
        message: e?.message || 'Move function lookup failed',
        variant: 'error',
      });
    } finally {
      setLoading(false);
    }
  }, [
    funcBuf,
    getMoveFunction,
    moduleBuf,
    node?.id,
    patchUI,
    pkgIdBuf,
    toast,
    ui._fnTParams,
  ]);

  // Render
  return (
    <div className="ptb-node--command">
      <div
        className="ptb-node-shell rounded-lg px-2 py-2 border-2 shadow relative"
        style={{ minHeight, width: NODE_SIZES.Command.width }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-2 mb-1">
          <div className="flex items-center gap-1 text-xxs text-gray-800 dark:text-gray-200 select-none">
            {iconOfCommand('moveCall')}
            {data?.label ?? (node as any)?.label ?? 'Move Call'}
          </div>
        </div>

        {/* Flow handles */}
        <PTBHandleFlow type="target" style={{ top: FLOW_TOP }} />
        <PTBHandleFlow type="source" style={{ top: FLOW_TOP }} />

        {/* Controls */}
        <div className="px-2 py-1 space-y-1">
          {/* Package row */}
          <div className="flex items-center gap-1">
            <TextInput
              placeholder="package id (0x...)"
              value={pkgIdBuf}
              onChange={(e) => setPkgIdBuf(e.target.value)}
              readOnly={readOnly}
            />
          </div>

          {/* Module input */}
          <TextInput
            placeholder="module"
            value={moduleBuf}
            onChange={(e) => setModuleBuf(e.target.value)}
            readOnly={readOnly}
          />

          {/* Function input */}
          <div className="flex items-center gap-1">
            <TextInput
              placeholder="function"
              value={funcBuf}
              onChange={(e) => setFuncBuf(e.target.value)}
              readOnly={readOnly}
            />
            <button
              type="button"
              className="px-2 py-1 text-[11px] border rounded bg-white dark:bg-stone-900 border-gray-300 dark:border-stone-700 text-gray-900 dark:text-gray-100 disabled:opacity-50"
              onMouseDown={(e) => e.preventDefault()}
              onClick={resolveFunction}
              disabled={
                readOnly ||
                loading ||
                !pkgIdBuf.trim() ||
                !moduleBuf.trim() ||
                !funcBuf.trim()
              }
              title="Resolve function signature"
            >
              {loading ? '...' : 'Use'}
            </button>
          </div>
          <div className="px-1 text-[10px] text-gray-500 dark:text-gray-400">
            Enter package, module, and function explicitly.
          </div>
        </div>

        {/* IO handles */}
        {inIO.map((port, idx) => (
          <PTBHandleIO
            key={port.id}
            port={port}
            position={Position.Left}
            style={{ top: ioTopForIndex(idx, ioOffset) }}
            label={labelOf(port)}
          />
        ))}
        {outIO.map((port, idx) => (
          <PTBHandleIO
            key={port.id}
            port={port}
            position={Position.Right}
            style={{ top: ioTopForIndex(idx, ioOffset) }}
            label={labelOf(port)}
          />
        ))}
      </div>
    </div>
  );
});

export default MoveCallCommand;
