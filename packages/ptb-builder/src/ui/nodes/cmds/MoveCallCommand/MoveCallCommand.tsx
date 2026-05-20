// src/ui/nodes/cmds/MoveCallCommand/MoveCallCommand.tsx
import { memo, useCallback, useEffect, useRef, useState } from 'react';

import type { Node, NodeProps } from '@xyflow/react';
import { Position } from '@xyflow/react';
import { parseObjectId } from '@zktx.io/ptb-model';

import type {
  CommandNode,
  CommandRuntimeParams,
  Port,
  PTBNode,
} from '../../../../ptb/graph/types';
import type { PTBFunctionData } from '../../../../ptb/ptbDoc';
import { PTBHandleFlow } from '../../../handles/PTBHandleFlow';
import { PTBHandleIO } from '../../../handles/PTBHandleIO';
import { PTBHandleType } from '../../../handles/PTBHandleType';
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
  moveCallFunctionNames,
  moveCallModuleNames,
  selectTargetAfterPackageLoad,
} from './packageSelection';
import { buildResolvedMoveCallState } from './resolveMoveCall';

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

const moveCallSelectClassName =
  'h-6 w-full px-2 text-[11px] border rounded bg-white dark:bg-stone-900 border-gray-300 dark:border-stone-700 text-gray-900 dark:text-gray-100 disabled:opacity-60';

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
  const runtime = (node?.params?.runtime ?? {}) as any;
  const target = splitMoveCallTarget(runtime.target);
  const pkgIdValue = target?.pkgId ?? '';
  const moduleValue = target?.moduleName ?? '';
  const functionValue = target?.functionName ?? '';

  const {
    ensureMoveFunctionSignature,
    getMovePackage,
    modules,
    packageIndexes,
    toast,
    readOnly,
  } = usePtb();

  // Local buffers avoid graph writes while typing an unresolved target.
  const [pkgIdBuf, setPkgIdBuf] = useState<string>(pkgIdValue);
  const [moduleBuf, setModuleBuf] = useState<string>(moduleValue);
  const [funcBuf, setFuncBuf] = useState<string>(functionValue);
  const [loading, setLoading] = useState(false);
  const lookupSeqRef = useRef(0);
  const packageId = parseObjectId((pkgIdBuf || '').trim());
  const packageIndex = packageId ? packageIndexes[packageId] : undefined;
  const loadedSignatureModules = packageId ? modules[packageId] : undefined;
  const packageLocked = Boolean(packageId && packageIndex);
  const moduleIndex = packageIndex ?? loadedSignatureModules;
  const moduleNames = moveCallModuleNames(moduleIndex);
  const functionNames =
    moduleBuf && moduleIndex?.[moduleBuf]
      ? moveCallFunctionNames(moduleIndex[moduleBuf])
      : [];

  // Ports (already materialized by registry; we only render them).
  const { inIO, outIO, inType } = useCommandPorts(node);
  const typeArgumentCount = inType.length;

  // Min-height accounts for IO rows plus the fixed controls offset.
  const minHeight = minHeightWithOffset(
    inIO.length + typeArgumentCount,
    outIO.length,
  );
  const controlOffset = 4 * ROW_SPACING + 24;
  const inputOffset = controlOffset + typeArgumentCount * ROW_SPACING;
  const outputOffset = typeArgumentCount > 0 ? inputOffset : controlOffset;

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

  const markDraftChanged = useCallback(() => {
    lookupSeqRef.current += 1;
    setLoading(false);
  }, []);

  const commitFunction = useCallback(
    (
      pkg: string,
      mod: string,
      fn: string,
      signature: PTBFunctionData[string],
    ) => {
      const resolved = buildResolvedMoveCallState({
        packageId: pkg,
        moduleName: mod,
        functionName: fn,
        signature,
        openSignatures: signature.openSignatures,
      });

      patchCommand(resolved.patch);
      setPkgIdBuf(pkg);
      setModuleBuf(mod);
      setFuncBuf(fn);
      if (resolved.typeArgumentCount > 0) {
        toast?.({
          message:
            'Move function selected. Connect TypeArgument nodes to bind generic arguments.',
          variant: 'warning',
        });
      }
    },
    [patchCommand, toast],
  );

  const loadPackage = useCallback(async () => {
    const pkg = (pkgIdBuf || '').trim();
    if (!pkg || !node?.id) return;
    const requestId = (lookupSeqRef.current += 1);

    try {
      setLoading(true);
      const result = await getMovePackage(pkg, { forceRefresh: true });
      if (!result) return;
      if (requestId !== lookupSeqRef.current) return;

      setPkgIdBuf(result.packageId);
      const nextTarget = selectTargetAfterPackageLoad(result.modules, {
        moduleName: moduleBuf,
        functionName: funcBuf,
      });
      const loadedModuleNames = moveCallModuleNames(result.modules);
      setModuleBuf(nextTarget.moduleName);
      setFuncBuf(nextTarget.functionName);

      if (!nextTarget.moduleName || !nextTarget.functionName) {
        toast?.({
          message:
            loadedModuleNames.length === 0
              ? 'Move package loaded, but no callable functions were found.'
              : 'Move package loaded. Choose a module and function.',
          variant: loadedModuleNames.length === 0 ? 'warning' : 'success',
        });
        return;
      }

      const resolved = await ensureMoveFunctionSignature(
        result.packageId,
        nextTarget.moduleName,
        nextTarget.functionName,
      );
      if (requestId !== lookupSeqRef.current) return;
      if (!resolved) return;

      commitFunction(
        resolved.packageId,
        resolved.moduleName,
        resolved.functionName,
        resolved.signature,
      );
      toast?.({ message: 'Move package loaded', variant: 'success' });
    } catch (e: any) {
      if (requestId !== lookupSeqRef.current) return;
      toast?.({
        message: e?.message || 'Move package lookup failed',
        variant: 'error',
      });
    } finally {
      if (requestId === lookupSeqRef.current) setLoading(false);
    }
  }, [
    commitFunction,
    ensureMoveFunctionSignature,
    getMovePackage,
    funcBuf,
    moduleBuf,
    node?.id,
    pkgIdBuf,
    toast,
  ]);

  const onChangeModule = useCallback(
    async (mod: string) => {
      if (!packageId || !moduleIndex) return;
      const requestId = (lookupSeqRef.current += 1);
      const functions = moveCallFunctionNames(moduleIndex[mod]);
      const nextFunction = functions[0];
      setModuleBuf(mod);
      if (!nextFunction) {
        setFuncBuf('');
        return;
      }
      setFuncBuf(nextFunction);
      setLoading(true);
      try {
        const resolved = await ensureMoveFunctionSignature(
          packageId,
          mod,
          nextFunction,
        );
        if (requestId !== lookupSeqRef.current || !resolved) return;
        commitFunction(
          resolved.packageId,
          resolved.moduleName,
          resolved.functionName,
          resolved.signature,
        );
      } finally {
        if (requestId === lookupSeqRef.current) setLoading(false);
      }
    },
    [commitFunction, ensureMoveFunctionSignature, moduleIndex, packageId],
  );

  const onChangeFunction = useCallback(
    async (fn: string) => {
      if (!packageId || !moduleBuf || !fn) {
        setFuncBuf(fn);
        return;
      }
      const requestId = (lookupSeqRef.current += 1);
      setFuncBuf(fn);
      setLoading(true);
      try {
        const resolved = await ensureMoveFunctionSignature(
          packageId,
          moduleBuf,
          fn,
        );
        if (requestId !== lookupSeqRef.current || !resolved) return;
        commitFunction(
          resolved.packageId,
          resolved.moduleName,
          resolved.functionName,
          resolved.signature,
        );
      } finally {
        if (requestId === lookupSeqRef.current) setLoading(false);
      }
    },
    [commitFunction, ensureMoveFunctionSignature, moduleBuf, packageId],
  );

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
                setModuleBuf('');
                setFuncBuf('');
              }}
              readOnly={readOnly || packageLocked}
            />
            {!readOnly && !packageLocked && (
              <button
                type="button"
                className="h-6 min-w-[42px] px-2 text-[11px] border rounded bg-white dark:bg-stone-900 border-gray-300 dark:border-stone-700 text-gray-900 dark:text-gray-100 disabled:opacity-50"
                onMouseDown={(e) => e.preventDefault()}
                onClick={loadPackage}
                disabled={loading || !pkgIdBuf.trim()}
                title="Load package metadata"
              >
                {loading ? '...' : 'Load'}
              </button>
            )}
          </div>

          {/* Module select */}
          <select
            aria-label="Move module"
            className={moveCallSelectClassName}
            value={moduleBuf}
            disabled={
              readOnly || !packageLocked || moduleNames.length === 0 || loading
            }
            onChange={(e) => onChangeModule(e.target.value)}
            onMouseDown={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
          >
            {moduleNames.length === 0 ? (
              <option value="">no modules</option>
            ) : (
              <>
                <option value="">choose module</option>
                {moduleNames.map((moduleName) => (
                  <option key={moduleName} value={moduleName}>
                    {moduleName}
                  </option>
                ))}
              </>
            )}
          </select>

          {/* Function select */}
          <select
            aria-label="Move function"
            className={moveCallSelectClassName}
            value={funcBuf}
            disabled={
              readOnly ||
              !packageLocked ||
              functionNames.length === 0 ||
              loading
            }
            onChange={(e) => onChangeFunction(e.target.value)}
            onMouseDown={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
          >
            {functionNames.length === 0 ? (
              <option value="">no functions</option>
            ) : (
              <>
                <option value="">choose function</option>
                {functionNames.map((functionName) => (
                  <option key={functionName} value={functionName}>
                    {functionName}
                  </option>
                ))}
              </>
            )}
          </select>
        </div>

        {/* IO handles */}
        {inType.map((port, idx) => (
          <PTBHandleType
            key={port.id}
            id={port.id}
            direction="in"
            position={Position.Left}
            style={{ top: ioTopForIndex(idx, controlOffset) }}
            label={labelOf(port)}
          />
        ))}
        {inIO.map((port, idx) => (
          <PTBHandleIO
            key={port.id}
            port={port}
            position={Position.Left}
            style={{ top: ioTopForIndex(idx, inputOffset) }}
            label={labelOf(port)}
          />
        ))}
        {outIO.map((port, idx) => (
          <PTBHandleIO
            key={port.id}
            port={port}
            position={Position.Right}
            style={{ top: ioTopForIndex(idx, outputOffset) }}
            label={labelOf(port)}
          />
        ))}
      </div>
    </div>
  );
});

export default MoveCallCommand;
