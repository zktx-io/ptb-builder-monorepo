// src/ui/nodes/cmds/MoveCallCommand/MoveCallCommand.tsx
import { memo, useCallback, useEffect, useRef, useState } from 'react';

import type { Node, NodeProps } from '@xyflow/react';
import { Position } from '@xyflow/react';

import type {
  CommandNode,
  CommandRuntimeParams,
  Port,
  PTBNode,
} from '../../../../ptb/graph/types';
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
import {
  buildResolvedMoveCallState,
  padTypeArguments,
} from './resolveMoveCall';

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
  onPatchCommand?: (
    nodeId: string,
    patch: {
      ui?: Record<string, unknown>;
      runtime?: CommandRuntimeParams;
      ports?: Port[];
    },
  ) => void;
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

function readTypeArguments(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

export const MoveCallCommand = memo(function MoveCallCommand({
  data,
}: NodeProps<MoveCallRFNode>) {
  const node = data?.ptbNode as CommandNode | undefined;
  const runtime = (node?.params?.runtime ?? {}) as any;
  const target = splitMoveCallTarget(runtime.target);
  const pkgIdValue = target?.pkgId ?? '';
  const moduleValue = target?.moduleName ?? '';
  const functionValue = target?.functionName ?? '';

  const { getMoveFunction, toast, readOnly } = usePtb();

  // Local buffers avoid graph writes while typing an unresolved target.
  const [pkgIdBuf, setPkgIdBuf] = useState<string>(pkgIdValue);
  const [moduleBuf, setModuleBuf] = useState<string>(moduleValue);
  const [funcBuf, setFuncBuf] = useState<string>(functionValue);
  const runtimeTypeArguments = readTypeArguments(runtime.typeArguments);
  const [pendingTypeArgumentCount, setPendingTypeArgumentCount] =
    useState<number>(runtimeTypeArguments.length);
  const typeArgumentCount = Math.max(
    pendingTypeArgumentCount,
    runtimeTypeArguments.length,
  );
  const [typeArgBufs, setTypeArgBufs] = useState<string[]>(
    padTypeArguments(runtimeTypeArguments, typeArgumentCount),
  );
  const [loading, setLoading] = useState(false);
  const lookupSeqRef = useRef(0);

  // Ports (already materialized by registry; we only render them).
  const { inIO, outIO } = useCommandPorts(node);

  // Min-height accounts for IO rows plus the fixed controls offset.
  const minHeight = minHeightWithOffset(
    inIO.length + typeArgumentCount,
    outIO.length,
  );
  const ioOffset = (4 + typeArgumentCount) * ROW_SPACING + 24;

  const patchCommand = useCallback(
    (patch: Parameters<NonNullable<MoveCallData['onPatchCommand']>>[1]) => {
      if (!node?.id || !data?.onPatchCommand) return;
      data.onPatchCommand(node.id, patch);
    },
    [data, node?.id],
  );

  // Keep the local pkg input buffer in sync when external UI state changes.
  useEffect(() => {
    setPkgIdBuf(pkgIdValue);
    setModuleBuf(moduleValue);
    setFuncBuf(functionValue);
  }, [functionValue, moduleValue, pkgIdValue]);

  const runtimeTypeArgumentsKey = runtimeTypeArguments.join('\u0000');
  useEffect(() => {
    const nextCount = runtimeTypeArguments.length;
    setPendingTypeArgumentCount(nextCount);
    setTypeArgBufs(padTypeArguments(runtimeTypeArguments, nextCount));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runtimeTypeArguments.length, runtimeTypeArgumentsKey]);

  const markDraftChanged = useCallback(() => {
    lookupSeqRef.current += 1;
    setLoading(false);
  }, []);

  const resolveFunction = useCallback(async () => {
    const pkg = (pkgIdBuf || '').trim();
    const mod = (moduleBuf || '').trim();
    const fn = (funcBuf || '').trim();
    if (!pkg || !mod || !fn || !node?.id) return;
    const requestId = (lookupSeqRef.current += 1);

    try {
      setLoading(true);
      const result = await getMoveFunction(pkg, mod, fn);
      if (!result) return;
      if (requestId !== lookupSeqRef.current) return;

      const sig = result.signature;
      const resolved = buildResolvedMoveCallState({
        packageId: result.packageId,
        moduleName: result.moduleName,
        functionName: result.functionName,
        signature: sig,
        openSignatures: result.openSignatures,
        typeArgumentBuffers: typeArgBufs,
      });

      setPendingTypeArgumentCount(resolved.typeArgumentCount);
      setTypeArgBufs(resolved.typeArgumentBuffers);

      if (resolved.typeArgumentError) {
        toast?.({
          message: resolved.typeArgumentError,
          variant: 'warning',
        });
        return;
      }

      patchCommand(resolved.patch);

      setPkgIdBuf(result.packageId);
      setModuleBuf(result.moduleName);
      setFuncBuf(result.functionName);
      if (resolved.needsConcreteTypeArguments) {
        toast?.({
          message:
            'Move function resolved. Enter concrete type arguments, then use it again to apply them.',
          variant: 'warning',
        });
        return;
      }
      toast?.({ message: 'Move function resolved', variant: 'success' });
    } catch (e: any) {
      if (requestId !== lookupSeqRef.current) return;
      toast?.({
        message: e?.message || 'Move function lookup failed',
        variant: 'error',
      });
    } finally {
      if (requestId === lookupSeqRef.current) setLoading(false);
    }
  }, [
    funcBuf,
    getMoveFunction,
    moduleBuf,
    node?.id,
    patchCommand,
    pkgIdBuf,
    typeArgBufs,
    toast,
  ]);

  // Render
  return (
    <div className="ptb-node--command">
      <div
        className="ptb-node-shell rounded-lg px-2 py-2 border-2 shadow relative"
        style={{ minHeight, width: NODE_SIZES.Command.width }}
      >
        {/* Header */}
        <div className="mb-1 flex h-4 items-center justify-between px-2">
          <div className="flex h-4 items-center gap-1 text-xxs leading-none text-gray-800 dark:text-gray-200 select-none">
            {iconOfCommand('moveCall')}
            {data?.label ?? node?.label ?? 'Move Call'}
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
              aria-label="Move package id"
              value={pkgIdBuf}
              onChange={(e) => {
                markDraftChanged();
                setPkgIdBuf(e.target.value);
              }}
              readOnly={readOnly}
            />
          </div>

          {/* Module input */}
          <TextInput
            placeholder="module"
            aria-label="Move module"
            value={moduleBuf}
            onChange={(e) => {
              markDraftChanged();
              setModuleBuf(e.target.value);
            }}
            readOnly={readOnly}
          />

          {/* Function input */}
          <div className="flex items-center gap-1">
            <TextInput
              placeholder="function"
              aria-label="Move function"
              value={funcBuf}
              onChange={(e) => {
                markDraftChanged();
                setFuncBuf(e.target.value);
              }}
              readOnly={readOnly}
            />
            {!readOnly && (
              <button
                type="button"
                className="h-6 min-w-[42px] px-2 text-[11px] border rounded bg-white dark:bg-stone-900 border-gray-300 dark:border-stone-700 text-gray-900 dark:text-gray-100 disabled:opacity-50"
                onMouseDown={(e) => e.preventDefault()}
                onClick={resolveFunction}
                disabled={
                  loading ||
                  !pkgIdBuf.trim() ||
                  !moduleBuf.trim() ||
                  !funcBuf.trim()
                }
                title="Resolve function signature"
              >
                {loading ? '...' : 'Use'}
              </button>
            )}
          </div>
          {typeArgumentCount > 0
            ? Array.from({ length: typeArgumentCount }, (_value, index) => (
                <TextInput
                  key={`type-arg-${index}`}
                  placeholder={`type argument T${index}`}
                  aria-label={`Move type argument T${index}`}
                  value={typeArgBufs[index] ?? ''}
                  onChange={(e) => {
                    const next = padTypeArguments(
                      typeArgBufs,
                      typeArgumentCount,
                    );
                    next[index] = e.target.value;
                    markDraftChanged();
                    setTypeArgBufs(next);
                  }}
                  readOnly={readOnly}
                />
              ))
            : undefined}
          {!readOnly && (
            <div className="px-1 text-[10px] text-gray-500 dark:text-gray-400">
              Resolve a function to materialize IO ports. Generic functions need
              concrete type arguments before runtime build.
            </div>
          )}
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
