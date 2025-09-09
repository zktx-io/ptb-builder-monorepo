// src/ui/nodes/cmds/BaseCommand/BaseCommand.tsx
// BaseCommand renders a Command node shell with flow handles, IO handles,
// a title row, and an optional count stepper.
//
// Policy:
// - No expand toggle.
// - Count stepper is shown only if the command declares a countKey.
// - Height is determined by IO rows (+ optional right-column offset).

import React, { memo, useMemo } from 'react';

import type { Node, NodeProps } from '@xyflow/react';
import { Position } from '@xyflow/react';

import { CommandCountStepper } from './CommandCountStepper';
import type { Port, PTBNode } from '../../../../ptb/graph/types';
import { countKeyOf } from '../../../../ptb/registry';
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
import { labelOf, useCommandPorts } from '../commandLayout';

type BaseCmdData = {
  label?: string;
  ptbNode?: PTBNode;
  onPatchUI?: (nodeId: string, patch: Record<string, unknown>) => void;
};
export type BaseCmdRFNode = Node<BaseCmdData, 'ptb-cmd'>;

export const BaseCommand = memo(function BaseCommand({
  data,
}: NodeProps<BaseCmdRFNode>) {
  const node = data?.ptbNode as PTBNode | undefined;
  const { readOnly } = usePtb();

  // Extract raw ports only if present (useful for labels; render uses useCommandPorts).
  const ports: Port[] = useMemo(() => {
    const raw = (node as any)?.ports;
    return Array.isArray(raw) ? (raw as Port[]) : [];
  }, [node]);

  // IO lists in UI order (left=in, right=out).
  const { inIO, outIO } = useCommandPorts(node);

  // Narrow to Command node to get command kind & UI map.
  const cmdNode =
    node && (node as any).kind === 'Command' ? (node as any as any) : undefined;
  const cmdKind: string | undefined = cmdNode?.command;
  const ui = (cmdNode?.params?.ui ?? {}) as Record<string, unknown>;

  // Which counter does this command support (if any)?
  const countKey = cmdKind ? countKeyOf(cmdKind) : undefined;

  // Right-column offset policy (visual alignment)
  const rightOffsetRows = cmdKind === 'splitCoins' ? 1 : 0;

  // Compute height from IO rows + right offset.
  const rowCount = Math.max(inIO.length, outIO.length + rightOffsetRows);
  const gaps = Math.max(0, rowCount - 1);
  const minHeight = TITLE_TO_IO_GAP + gaps * ROW_SPACING + BOTTOM_PADDING;

  const title = data?.label ?? (node as any)?.label ?? 'Command';

  return (
    <div className="ptb-node--command">
      <div
        className="ptb-node-shell rounded-lg px-2 py-2 border-2 shadow relative"
        style={{ minHeight, width: NODE_SIZES.Command.width }}
      >
        {/* Title row */}
        <div className="flex items-center justify-between px-2 mb-1">
          <div className="flex items-center gap-1 text-xxs text-gray-800 dark:text-gray-200">
            {iconOfCommand(cmdKind)}
            {title}
          </div>

          {/* Count stepper when supported */}
          {countKey ? (
            <CommandCountStepper
              cmdKind={cmdKind}
              nodeId={node?.id}
              ui={ui}
              onPatchUI={data?.onPatchUI}
              min={1}
              disabled={readOnly}
              countKey={countKey}
            />
          ) : (
            <></>
          )}
        </div>

        {/* Flow handles */}
        <PTBHandleFlow type="target" style={{ top: FLOW_TOP }} />
        <PTBHandleFlow type="source" style={{ top: FLOW_TOP }} />

        {/* Left: input IO handles */}
        {inIO.map((port, idx) => (
          <PTBHandleIO
            key={port.id}
            port={port}
            position={Position.Left}
            style={{ top: ioTopForIndex(idx) }}
            label={labelOf(port)}
          />
        ))}

        {/* Right: output IO handles with optional visual offset */}
        {outIO.map((port, idx) => (
          <PTBHandleIO
            key={port.id}
            port={port}
            position={Position.Right}
            style={{ top: ioTopForIndex(idx + rightOffsetRows) }}
            label={labelOf(port)}
          />
        ))}
      </div>
    </div>
  );
});

export default BaseCommand;
