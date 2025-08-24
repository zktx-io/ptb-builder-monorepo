// Port order strictly follows the Registry (no client-side sorting).

import React, { useMemo } from 'react';

import type { Node, NodeProps, Position } from '@xyflow/react';
import { Position as RFPos } from '@xyflow/react';

import { CommandCountStepper } from './CommandCountStepper';
import { CommandExpandSwitch } from './CommandExpandSwitch';
import { canExpandCommand, expandedKeyOf } from './registry';
import type { Port, PTBNode } from '../../../../ptb/graph/types';
import { PTBHandleFlow } from '../../../handles/PTBHandleFlow';
import { PTBHandleIO } from '../../../handles/PTBHandleIO';
import {
  IconBrackets,
  IconMerge,
  IconMoveCall,
  IconSplit,
  IconTransfer,
} from '../../../menu/icons';

export type BaseCmdData = {
  label?: string;
  ptbNode?: PTBNode;
  onPatchUI?: (nodeId: string, patch: Record<string, unknown>) => void;
};
export type BaseCmdRFNode = Node<BaseCmdData, 'ptb-cmd'>;

const FLOW_TOP = 16;
const ROW_SPACING = 24;
const TITLE_TO_IO_GAP = 40;
const BOTTOM_PADDING = 16;

function labelOf(p: Port): string {
  return (p as any).label ?? p.id ?? '';
}
const ioTopForIndex = (idx: number) => TITLE_TO_IO_GAP + idx * ROW_SPACING;

function iconOfCommand(kind?: string) {
  switch (kind) {
    case 'splitCoins':
      return (
        <span className="inline-flex w-4 h-4 text-current">
          <IconSplit />
        </span>
      );
    case 'mergeCoins':
      return (
        <span className="inline-flex w-4 h-4 text-current">
          <IconMerge />
        </span>
      );
    case 'transferObjects':
      return (
        <span className="inline-flex w-4 h-4 text-current">
          <IconTransfer />
        </span>
      );
    case 'makeMoveVec':
      return (
        <span className="inline-flex w-4 h-4 text-current">
          <IconBrackets />
        </span>
      );
    case 'moveCall':
      return (
        <span className="inline-flex w-4 h-4 text-current">
          <IconMoveCall />
        </span>
      );
    default:
      return <></>;
  }
}

export function BaseCommand({ data }: NodeProps<BaseCmdRFNode>) {
  const node = data?.ptbNode as PTBNode | undefined;

  // Ports from registry (preserve order)
  const ports: Port[] = useMemo(() => {
    const raw = (node as any)?.ports;
    return Array.isArray(raw) ? (raw as Port[]) : [];
  }, [node]);

  const inIO = useMemo(
    () => ports.filter((p) => p.role === 'io' && p.direction === 'in'),
    [ports],
  );
  const outIO = useMemo(
    () => ports.filter((p) => p.role === 'io' && p.direction === 'out'),
    [ports],
  );

  // Command metadata
  const cmdNode =
    (node as any)?.kind === 'Command' ? (node as any as any) : undefined;
  const cmdKind: string | undefined = cmdNode?.command;
  const ui = (cmdNode?.params?.ui ?? {}) as Record<string, unknown>;

  // Use registry utilities (single source of truth)
  const expKey = expandedKeyOf(cmdKind);
  const isExpanded = expKey ? Boolean(ui?.[expKey]) : false;
  const allowed = canExpandCommand(cmdKind, ui as any);

  // Stepper only when expanded & allowed
  const showStepper = isExpanded && allowed && !!cmdKind;

  // Right column shifts for Split/MakeMoveVec (when stepper visible)
  const shiftRight =
    showStepper && (cmdKind === 'splitCoins' || cmdKind === 'makeMoveVec')
      ? 1
      : 0;

  const rowCount = Math.max(inIO.length, outIO.length + shiftRight);
  const minHeight =
    TITLE_TO_IO_GAP +
    (rowCount > 0 ? rowCount * ROW_SPACING : 0) +
    BOTTOM_PADDING;

  return (
    <div className="ptb-node--command">
      <div
        className="ptb-node-shell rounded-lg w-[200px] px-2 py-2 border-2 shadow relative"
        style={{ minHeight }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-2 mb-1">
          <div className="flex items-center gap-1 text-gray-800 dark:text-gray-200 select-none">
            {iconOfCommand(cmdKind)}
            <p className="text-sm">
              {data?.label ?? (node as any)?.label ?? 'Command'}
            </p>
          </div>

          <CommandExpandSwitch
            cmdKind={cmdKind}
            ui={ui}
            nodeId={node?.id}
            onPatchUI={data?.onPatchUI}
            labels={{ off: 'V', on: 'E' }}
            disabled={!allowed}
          />
        </div>

        {/* Flow handles */}
        <PTBHandleFlow type="target" style={{ top: FLOW_TOP }} />
        <PTBHandleFlow type="source" style={{ top: FLOW_TOP }} />

        {/* Stepper row (right-aligned) */}
        {showStepper && (
          <div className="w-full flex justify-end px-2">
            <CommandCountStepper
              cmdKind={cmdKind}
              nodeId={node?.id}
              ui={ui}
              onPatchUI={data?.onPatchUI}
              min={1}
            />
          </div>
        )}

        {/* INPUT IO (left) */}
        {inIO.map((port, idx) => (
          <PTBHandleIO
            key={port.id}
            port={port}
            position={RFPos.Left as Position}
            style={{ top: ioTopForIndex(idx) }}
            label={labelOf(port)}
          />
        ))}

        {/* OUTPUT IO (right) */}
        {outIO.map((port, idx) => (
          <PTBHandleIO
            key={port.id}
            port={port}
            position={RFPos.Right as Position}
            style={{ top: ioTopForIndex(idx + shiftRight) }}
            label={labelOf(port)}
          />
        ))}
      </div>
    </div>
  );
}

export default React.memo(BaseCommand);
