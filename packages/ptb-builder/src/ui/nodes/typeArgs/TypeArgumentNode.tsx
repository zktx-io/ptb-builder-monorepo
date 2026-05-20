import { memo, useCallback, useEffect, useState } from 'react';

import type { Node, NodeProps } from '@xyflow/react';
import { Position } from '@xyflow/react';
import { parseMoveTypeTag } from '@zktx.io/ptb-model';
import { ChevronsLeftRight } from 'lucide-react';

import type {
  PTBNode,
  TypeArgumentNode as PTBTypeArgumentNode,
} from '../../../ptb/graph/types';
import { PTBHandleType } from '../../handles/PTBHandleType';
import { usePtb } from '../../PtbProvider';
import { TextInput } from '../vars/inputs/TextInput';

export type TypeArgumentData = {
  label?: string;
  ptbNode?: PTBNode;
  onPatchTypeArgument?: (
    nodeId: string,
    patch: Partial<PTBTypeArgumentNode>,
  ) => void;
};

export type TypeArgumentRFNode = Node<TypeArgumentData, 'ptb-typearg'>;

function splitTopLevelTypeArguments(value: string): string[] {
  const result: string[] = [];
  let depth = 0;
  let start = 0;
  for (let index = 0; index < value.length; index++) {
    const char = value[index];
    if (char === '<') depth++;
    else if (char === '>') depth = Math.max(0, depth - 1);
    else if (char === ',' && depth === 0) {
      result.push(value.slice(start, index).trim());
      start = index + 1;
    }
  }
  result.push(value.slice(start).trim());
  return result.filter(Boolean);
}

function moveTypeDisplayName(value: string): string | undefined {
  const canonical = parseMoveTypeTag(value);
  if (!canonical) return undefined;

  const genericStart = canonical.indexOf('<');
  const base = genericStart >= 0 ? canonical.slice(0, genericStart) : canonical;
  const parts = base.split('::');
  const name = parts[parts.length - 1] ?? base;
  if (genericStart < 0) return name;

  const genericBody = canonical.slice(genericStart + 1, -1);
  const args = splitTopLevelTypeArguments(genericBody).map(
    (item) => moveTypeDisplayName(item) ?? item,
  );
  return `${name}<${args.join(', ')}>`;
}

export const TypeArgumentNode = memo(function TypeArgumentNode({
  data,
}: NodeProps<TypeArgumentRFNode>) {
  const node = data?.ptbNode as PTBTypeArgumentNode | undefined;
  const { readOnly } = usePtb();
  const [value, setValue] = useState(node?.value ?? '');
  const title =
    moveTypeDisplayName(node?.value ?? '') ??
    data?.label ??
    node?.label ??
    'Type Argument';
  const fullTitle = node?.value || title;

  useEffect(() => {
    setValue(node?.value ?? '');
  }, [node?.id, node?.value]);

  const patchValue = useCallback(
    (next: string) => {
      if (!node?.id || !data?.onPatchTypeArgument || readOnly) return;
      data.onPatchTypeArgument(node.id, { value: next.trim() });
    },
    [data, node?.id, readOnly],
  );

  return (
    <div className="ptb-node--typearg">
      <div
        className="ptb-node-shell rounded-lg py-2 px-2 border-2 shadow relative"
        style={{ width: 180, minHeight: 74 }}
      >
        <div className="mb-2 flex items-center gap-1 text-xxs text-gray-800 dark:text-gray-200">
          <span className="ptb-typearg-icon" aria-hidden="true">
            <ChevronsLeftRight size={13} strokeWidth={2.4} />
          </span>
          <span className="ptb-typearg-title" title={fullTitle}>
            {title}
          </span>
        </div>
        <TextInput
          value={value}
          placeholder="0x2::sui::SUI"
          aria-label="Move type argument"
          readOnly={readOnly}
          onChange={(event) => {
            const next = event.target.value;
            setValue(next);
            patchValue(next);
          }}
        />
        <PTBHandleType
          id="out_type"
          direction="out"
          position={Position.Right}
        />
      </div>
    </div>
  );
});

export default TypeArgumentNode;
