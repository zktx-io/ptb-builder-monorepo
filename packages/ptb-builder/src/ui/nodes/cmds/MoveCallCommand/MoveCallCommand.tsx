// UI for MoveCall command (compact, BaseCommand-aligned):
// 1) Package ID input + Load (locks after success)
// 2) Module select (from loaded modules)
// 3) Function select (from selected module; disabled when none)
// State is persisted in node.params.ui: { pkgId, pkgLocked, module, func, _nameModules_, _moduleFunctions_ }

import React, { useCallback, useEffect, useMemo, useState } from 'react';

import type { Node, NodeProps, Position } from '@xyflow/react';
import { Position as RFPos } from '@xyflow/react';

import type { CommandNode, Port, PTBNode } from '../../../../ptb/graph/types';
import { PTBHandleFlow } from '../../../handles/PTBHandleFlow';
import { PTBHandleIO } from '../../../handles/PTBHandleIO';
import { usePtb } from '../../../PtbProvider';
import { iconOfCommand } from '../../icons';
import { SmallSelect } from '../../vars/inputs/SmallSelect';
import TextInput from '../../vars/inputs/TextInput';
import {
  BOTTOM_PADDING,
  FLOW_TOP,
  ioTopForIndex,
  labelOf,
  ROW_SPACING,
  TITLE_TO_IO_GAP,
  useCommandPorts,
} from '../shared';

export type MoveCallData = {
  label?: string;
  ptbNode?: PTBNode;
  onPatchUI?: (nodeId: string, patch: Record<string, unknown>) => void;
};

export type MoveCallRFNode = Node<MoveCallData, 'ptb-mvc'>;

function MoveCallCommand({ data }: NodeProps<MoveCallRFNode>) {
  const node = data?.ptbNode as CommandNode | undefined;
  const ui = ((node?.params?.ui ?? {}) as any) || {};

  const { adapters, getPackageModulesView } = usePtb();

  const [pkgIdBuf, setPkgIdBuf] = useState<string>(ui.pkgId ?? '');
  const [loading, setLoading] = useState(false);

  // Ports (already materialized by registry)
  const ports: Port[] = useMemo(
    () => (Array.isArray((node as any)?.ports) ? (node as any).ports : []),
    [node],
  );
  const { inIO, outIO } = useCommandPorts(node);

  const moduleNames: string[] = Array.isArray(ui._nameModules_)
    ? ui._nameModules_
    : [];
  const fnNames: string[] =
    (ui.module && Array.isArray(ui._moduleFunctions_?.[ui.module])
      ? ui._moduleFunctions_[ui.module]
      : []) || [];

  const rowCount = Math.max(inIO.length, outIO.length);
  const minHeight =
    TITLE_TO_IO_GAP +
    (rowCount > 0 ? rowCount * ROW_SPACING : 0) +
    BOTTOM_PADDING;

  const patchUI = useCallback(
    (patch: Record<string, unknown>) => {
      if (!node?.id || !data?.onPatchUI) return;
      data.onPatchUI(node.id, patch);
    },
    [data, node?.id],
  );

  useEffect(() => {
    setPkgIdBuf(ui.pkgId ?? '');
  }, [ui.pkgId]);

  const loadPackage = useCallback(async () => {
    const pkg = (pkgIdBuf || '').trim();
    if (!pkg || !node?.id) return;

    try {
      setLoading(true);
      const view = await getPackageModulesView(pkg, { forceRefresh: true });
      if (!view) {
        adapters?.toast?.({
          message: 'Failed to load package metadata',
          variant: 'error',
        });
        return;
      }

      const moduleToFuncs: Record<string, string[]> = {};
      for (const m of view._nameModules_) {
        moduleToFuncs[m] = view.modules[m]?._nameFunctions_ ?? [];
      }

      const nextModule = view._nameModules_[0] ?? '';
      const nextFunc = nextModule ? (moduleToFuncs[nextModule][0] ?? '') : '';

      patchUI({
        pkgId: pkg,
        pkgLocked: true,
        _nameModules_: view._nameModules_,
        _moduleFunctions_: moduleToFuncs,
        module: nextModule || undefined,
        func: nextFunc || undefined,
      });

      adapters?.toast?.({ message: 'Package loaded', variant: 'success' });
    } catch (e: any) {
      adapters?.toast?.({
        message: e?.message || 'Package load failed',
        variant: 'error',
      });
    } finally {
      setLoading(false);
    }
  }, [pkgIdBuf, node?.id, getPackageModulesView, patchUI, adapters]);

  const onChangeModule = useCallback(
    (mod: string) => {
      patchUI({
        module: mod || undefined,
        func: mod ? (ui._moduleFunctions_?.[mod]?.[0] ?? undefined) : undefined,
      });
    },
    [patchUI, ui._moduleFunctions_],
  );

  const onChangeFunc = useCallback(
    (fn: string) => {
      patchUI({ func: fn || undefined });
    },
    [patchUI],
  );

  return (
    <div className="ptb-node--command">
      <div
        className="ptb-node-shell rounded-lg w-[200px] px-2 py-2 border-2 shadow relative"
        style={{ minHeight }}
      >
        {/* Header (match BaseCommand styling) */}
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
            />
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
          </div>

          {/* Module select */}
          <SmallSelect
            value={ui.module ?? ''}
            options={moduleNames}
            placeholderOption="no modules"
            onChange={(v) => onChangeModule(v)}
            disabled={!ui.pkgLocked || moduleNames.length === 0}
          />

          {/* Function select */}
          <SmallSelect
            value={ui.func ?? ''}
            options={fnNames}
            placeholderOption="n/a"
            onChange={(v) => onChangeFunc(v)}
            disabled={!ui.pkgLocked || !ui.module || fnNames.length === 0}
          />
        </div>

        {/* IO handles */}
        {inIO.map((port, idx) => (
          <PTBHandleIO
            key={port.id}
            port={port}
            position={RFPos.Left as Position}
            style={{ top: ioTopForIndex(idx) }}
            label={labelOf(port)}
          />
        ))}
        {outIO.map((port, idx) => (
          <PTBHandleIO
            key={port.id}
            port={port}
            position={RFPos.Right as Position}
            style={{ top: ioTopForIndex(idx) }}
            label={labelOf(port)}
          />
        ))}
      </div>
    </div>
  );
}

export default React.memo(MoveCallCommand);
