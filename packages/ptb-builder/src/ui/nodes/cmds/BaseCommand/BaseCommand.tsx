// src/ui/nodes/cmds/BaseCommand/BaseCommand.tsx
// BaseCommand renders a Command node shell with flow handles, IO handles,
// a title row, and an optional count stepper.
//
// Policy:
// - No expand toggle.
// - Count stepper is shown only if the command declares a countKey.
// - Height is determined by IO rows (+ optional right-column offset).

import { memo } from 'react';

import type { Node, NodeProps } from '@xyflow/react';
import { Position } from '@xyflow/react';
import { toPTBTypeFromConcreteTypeArgument } from '@zktx.io/ptb-model';

import { CommandCountStepper } from './CommandCountStepper';
import type {
  CommandNode,
  CommandRuntimeParams,
  PTBNode,
} from '../../../../ptb/graph/types';
import { countKeyOf, countMinOf } from '../../../../ptb/registry';
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

type BaseCmdData = {
  label?: string;
  ptbNode?: PTBNode;
  onPatchUI?: (nodeId: string, patch: Record<string, unknown>) => void;
  onPatchCommand?: (
    nodeId: string,
    patch: { runtime?: CommandRuntimeParams },
  ) => void;
};
export type BaseCmdRFNode = Node<BaseCmdData, 'ptb-cmd'>;

export const BaseCommand = memo(function BaseCommand({
  data,
}: NodeProps<BaseCmdRFNode>) {
  const node = data?.ptbNode as PTBNode | undefined;
  const { readOnly } = usePtb();

  // IO lists in UI order (left=in, right=out).
  const { inIO, outIO } = useCommandPorts(node);

  // Narrow to Command node to get command kind & UI map.
  const cmdNode = node?.kind === 'Command' ? (node as CommandNode) : undefined;
  const cmdKind: string | undefined = cmdNode?.command;
  const ui = (cmdNode?.params?.ui ?? {}) as Record<string, unknown>;
  const runtime = (cmdNode?.params?.runtime ?? {}) as CommandRuntimeParams;
  const runtimeType =
    typeof runtime.type === 'string' ? runtime.type : undefined;
  const showMakeMoveVecType = cmdKind === 'makeMoveVec';
  const inspectionOnly = cmdKind === 'publish' || cmdKind === 'upgrade';
  const makeMoveVecTypeValue = showMakeMoveVecType ? (runtimeType ?? '') : '';
  const makeMoveVecTypeValid =
    !makeMoveVecTypeValue.trim() ||
    !!toPTBTypeFromConcreteTypeArgument(makeMoveVecTypeValue.trim());

  // Which counter does this command support (if any)?
  const countKey = cmdKind ? countKeyOf(cmdKind) : undefined;
  const countMin = countMinOf(cmdKind, runtime) ?? 1;

  // Right-column offset policy (visual alignment)
  const rightOffsetRows = cmdKind === 'splitCoins' ? 1 : 0;

  // Compute height from IO rows + right offset.
  const showInspectionNote = inspectionOnly && !readOnly;
  const ioOffset =
    (showMakeMoveVecType ? 28 : 0) + (showInspectionNote ? 18 : 0);
  const rowCount = Math.max(inIO.length, outIO.length + rightOffsetRows);
  const gaps = Math.max(0, rowCount - 1);
  const minHeight =
    TITLE_TO_IO_GAP + ioOffset + gaps * ROW_SPACING + BOTTOM_PADDING;

  const title = data?.label ?? node?.label ?? 'Command';

  return (
    <div className="ptb-node--command">
      <div
        className="ptb-node-shell rounded-lg px-2 py-2 border-2 shadow relative"
        style={{ minHeight, width: NODE_SIZES.Command.width }}
      >
        {/* Title row */}
        <div className="mb-1 flex h-4 items-center justify-between px-2">
          <div className="flex h-4 items-center gap-1 text-xxs leading-none text-gray-800 dark:text-gray-200">
            {iconOfCommand(cmdKind)}
            {title}
          </div>

          {/* Count stepper when supported */}
          {!readOnly && countKey ? (
            <CommandCountStepper
              nodeId={node?.id}
              ui={ui}
              onPatchUI={data?.onPatchUI}
              min={countMin}
              countKey={countKey}
            />
          ) : (
            <></>
          )}
        </div>

        {showInspectionNote ? (
          <div
            className="px-2 mb-1 text-[10px] text-amber-700 dark:text-amber-300"
            title="Publish and Upgrade authoring requires the Move toolchain."
          >
            Inspection only
          </div>
        ) : undefined}

        {showMakeMoveVecType ? (
          <div className="px-2 mb-1">
            <TextInput
              aria-label="MakeMoveVec type"
              placeholder="type (u64, 0x...::T)"
              value={makeMoveVecTypeValue}
              readOnly={readOnly}
              className={
                makeMoveVecTypeValid
                  ? 'h-5 py-0 text-[10px]'
                  : 'h-5 py-0 text-[10px] border-amber-500'
              }
              onMouseDown={(event) => event.stopPropagation()}
              onChange={(event) => {
                if (!node?.id || !data?.onPatchCommand) return;
                const value = event.target.value;
                data.onPatchCommand(node.id, {
                  runtime: {
                    ...runtime,
                    type: value.trim() ? value : undefined,
                  },
                });
              }}
            />
          </div>
        ) : undefined}

        {/* Flow handles */}
        <PTBHandleFlow type="target" style={{ top: FLOW_TOP }} />
        <PTBHandleFlow type="source" style={{ top: FLOW_TOP }} />

        {/* Left: input IO handles */}
        {inIO.map((port, idx) => (
          <PTBHandleIO
            key={port.id}
            port={port}
            position={Position.Left}
            style={{ top: ioTopForIndex(idx, ioOffset) }}
            label={labelOf(port)}
          />
        ))}

        {/* Right: output IO handles with optional visual offset */}
        {outIO.map((port, idx) => (
          <PTBHandleIO
            key={port.id}
            port={port}
            position={Position.Right}
            style={{ top: ioTopForIndex(idx + rightOffsetRows, ioOffset) }}
            label={labelOf(port)}
          />
        ))}
      </div>
    </div>
  );
});

export default BaseCommand;
