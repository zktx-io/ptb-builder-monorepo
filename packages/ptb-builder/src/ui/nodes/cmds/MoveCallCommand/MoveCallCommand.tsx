// src/ui/nodes/cmds/MoveCallCommand/MoveCallCommand.tsx
import React, { memo, useCallback, useEffect, useState } from 'react';

import type { Node, NodeProps, Position } from '@xyflow/react';
import { Position as RFPos } from '@xyflow/react';

import type {
  CommandNode,
  PTBNode,
  PTBType,
} from '../../../../ptb/graph/types';
import { toPTBTypeFromMove } from '../../../../ptb/move/toPTBType';
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
import { SmallSelect } from '../../vars/inputs/SmallSelect';
import { TextInput } from '../../vars/inputs/TextInput';
import { labelOf, useCommandPorts } from '../commandLayout';

/** Move normalized metadata sometimes gives number or array for type params. */
function getTypeParamCount(anyTp: unknown): number {
  if (Array.isArray(anyTp)) return anyTp.length;
  if (typeof anyTp === 'number' && Number.isFinite(anyTp)) return anyTp;
  return 0;
}

/** Compute min-height including the fixed controls offset so the shell never clips. */
function minHeightWithOffset(inCount: number, outCount: number) {
  const MVC_CONTROL_ROWS = 3; // package + module + function rows
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

export const MoveCallCommand = memo(function MoveCallCommand({
  data,
}: NodeProps<MoveCallRFNode>) {
  const node = data?.ptbNode as CommandNode | undefined;
  const ui = ((node?.params?.ui ?? {}) as any) || {};

  const { getPackageModulesView, toast, readOnly } = usePtb();

  // Local buffer for the package id input (avoid graph writes while typing).
  const [pkgIdBuf, setPkgIdBuf] = useState<string>(ui.pkgId ?? '');
  const [loading, setLoading] = useState(false);

  // Ports (already materialized by registry; we only render them).
  const { inIO, outIO } = useCommandPorts(node);

  // Lists from UI (populated after load).
  const moduleNames: string[] = Array.isArray(ui._nameModules_)
    ? ui._nameModules_
    : [];
  const fnNames: string[] =
    (ui.module &&
      Array.isArray(ui._moduleFunctions_?.[ui.module]) &&
      ui._moduleFunctions_[ui.module]) ||
    [];

  // Min-height accounts for IO rows plus the fixed controls offset.
  const minHeight = minHeightWithOffset(inIO.length, outIO.length);

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
    setPkgIdBuf(ui.pkgId ?? '');
  }, [ui.pkgId]);

  // Load package → store modules, functions, and normalized fn signatures.
  const loadPackage = useCallback(async () => {
    const pkg = (pkgIdBuf || '').trim();
    if (!pkg || !node?.id) return;

    try {
      setLoading(true);
      const view = await getPackageModulesView(pkg, { forceRefresh: true });
      if (!view) {
        toast?.({
          message: 'Failed to load package metadata',
          variant: 'error',
        });
        return;
      }

      // Build function lists per module and normalized signatures for ins/outs.
      const moduleToFuncs: Record<string, string[]> = {};
      const sigs: Record<
        string,
        Record<string, { tparamCount: number; ins: PTBType[]; outs: PTBType[] }>
      > = {};

      for (const m of view._nameModules_) {
        const mod = view.modules[m];
        const names = mod?._nameFunctions_ ?? [];
        moduleToFuncs[m] = names;

        sigs[m] = {};
        for (const fn of names) {
          const f = mod.exposedFunctions[fn];
          const tparamCount = getTypeParamCount((f as any).typeParameters);
          const ins = (f.parameters ?? []).map(toPTBTypeFromMove);
          const outs = (f.return ?? []).map(toPTBTypeFromMove);
          sigs[m][fn] = { tparamCount, ins, outs };
        }
      }

      // Pick first module/function as defaults.
      const nextModule = view._nameModules_[0] ?? '';
      const nextFunc = nextModule ? (moduleToFuncs[nextModule][0] ?? '') : '';
      const sig =
        nextModule && nextFunc ? sigs[nextModule]?.[nextFunc] : undefined;

      // SSOT for generics: string[] of type tags the user will fill later.
      // Initialize with empty strings so registry can create T-arg input ports.
      const _fnTParams = Array.from(
        { length: sig?.tparamCount ?? 0 },
        () => '',
      );

      patchUI({
        pkgId: pkg,
        pkgLocked: true,
        _nameModules_: view._nameModules_,
        _moduleFunctions_: moduleToFuncs,
        _fnSigs_: sigs,

        module: nextModule || undefined,
        func: nextFunc || undefined,

        // SSOT only: do NOT store any count; array length is the source of truth
        _fnTParams,

        // Normalized ins/outs for port rendering
        _fnIns: sig?.ins ?? [],
        _fnOuts: sig?.outs ?? [],
      });

      toast?.({ message: 'Package loaded', variant: 'success' });
    } catch (e: any) {
      toast?.({
        message: e?.message || 'Package load failed',
        variant: 'error',
      });
    } finally {
      setLoading(false);
    }
  }, [toast, getPackageModulesView, node?.id, patchUI, pkgIdBuf]);

  // Module change → pick first function of the module and update signatures.
  const onChangeModule = useCallback(
    (mod: string) => {
      const nextFunc = mod ? (ui._moduleFunctions_?.[mod]?.[0] ?? '') : '';
      const sig = mod && nextFunc ? ui._fnSigs_?.[mod]?.[nextFunc] : undefined;

      const _fnTParams = Array.from(
        { length: sig?.tparamCount ?? 0 },
        () => '',
      );

      patchUI({
        module: mod || undefined,
        func: nextFunc || undefined,

        // keep only the array
        _fnTParams,
        _fnIns: sig?.ins ?? [],
        _fnOuts: sig?.outs ?? [],
      });
    },
    [patchUI, ui._fnSigs_, ui._moduleFunctions_],
  );

  // Function change → update signatures.
  const onChangeFunc = useCallback(
    (fn: string) => {
      const mod = ui.module as string | undefined;
      const sig = mod && fn ? ui._fnSigs_?.[mod]?.[fn] : undefined;

      const _fnTParams = Array.from(
        { length: sig?.tparamCount ?? 0 },
        () => '',
      );

      patchUI({
        func: fn || undefined,

        // keep only the array
        _fnTParams,

        _fnIns: sig?.ins ?? [],
        _fnOuts: sig?.outs ?? [],
      });
    },
    [patchUI, ui._fnSigs_, ui.module],
  );

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
              disabled={ui.pkgLocked}
              readOnly={readOnly}
            />
            {!ui.pkgLocked && (
              <button
                type="button"
                className="px-2 py-1 text-[11px] border rounded bg-white dark:bg-stone-900 border-gray-300 dark:border-stone-700 text-gray-900 dark:text-gray-100 disabled:opacity-50"
                onMouseDown={(e) => e.preventDefault()}
                onClick={loadPackage}
                disabled={ui.pkgLocked || !pkgIdBuf.trim() || loading}
                title={
                  ui.pkgLocked ? 'Package is locked' : 'Load package metadata'
                }
              >
                {loading ? '...' : 'Load'}
              </button>
            )}
          </div>

          {/* Module select */}
          <SmallSelect
            value={ui.module ?? ''}
            options={moduleNames}
            placeholderOption="no modules"
            onChange={(v) => onChangeModule(v)}
            disabled={!ui.pkgLocked || moduleNames.length === 0 || readOnly}
          />

          {/* Function select */}
          <SmallSelect
            value={ui.func ?? ''}
            options={fnNames}
            placeholderOption="n/a"
            onChange={(v) => onChangeFunc(v)}
            disabled={
              !ui.pkgLocked || !ui.module || fnNames.length === 0 || readOnly
            }
          />
        </div>

        {/* IO handles */}
        {inIO.map((port, idx) => (
          <PTBHandleIO
            key={port.id}
            port={port}
            position={RFPos.Left as Position}
            style={{ top: ioTopForIndex(idx, 3 * ROW_SPACING + 24) }}
            label={labelOf(port)}
          />
        ))}
        {outIO.map((port, idx) => (
          <PTBHandleIO
            key={port.id}
            port={port}
            position={RFPos.Right as Position}
            style={{ top: ioTopForIndex(idx, 3 * ROW_SPACING + 24) }}
            label={labelOf(port)}
          />
        ))}
      </div>
    </div>
  );
});

export default MoveCallCommand;
