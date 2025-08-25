import React from 'react';

import {
  BookA,
  Box,
  Calculator,
  Clock,
  Cog,
  Dices,
  Fuel,
  Hash,
  MessageCircleQuestionIcon,
  Power,
  Wallet,
} from 'lucide-react';

import { IconSui } from './IconSui';
import { PTBType, VariableNode } from '../../../ptb/graph/types';

/** Resolve an icon for a PTBType (vector unwraps to its element type) */
function iconOfType(t?: PTBType): React.ReactNode {
  if (!t) return <MessageCircleQuestionIcon size={14} />;

  if (t.kind === 'vector') {
    // unwrap vector → show element type icon only
    return iconOfType(t.elem);
  }

  switch (t.kind) {
    case 'object':
      return <Box size={14} />;
    case 'move_numeric':
      return <Calculator size={14} />;
    case 'scalar':
      if (t.name === 'address') return <Hash size={14} />;
      if (t.name === 'bool') return <Power size={14} />;
      if (t.name === 'number') return <Calculator size={14} />;
      if (t.name === 'string') return <BookA size={14} />;
      return <MessageCircleQuestionIcon size={14} />;
    default:
      return <MessageCircleQuestionIcon size={14} />;
  }
}

/** Resolve an icon for a variable node based on its name/type */
export function iconOfVar(
  v?: VariableNode,
  displayLabel?: string,
): React.ReactNode {
  const name = (v?.name ?? '').toLowerCase().trim();
  const lbl = (displayLabel ?? v?.label ?? '').trim();

  // helpers / constants
  if (name === 'sender' || name === 'wallet') return <Wallet size={14} />;
  if (name === 'gas') return <Fuel size={14} />;
  if (name === 'clock') return <Clock size={14} />;
  if (name === 'system') return <Cog size={14} />;
  if (name === 'random') return <Dices size={14} />;
  if (name === 'sui' || lbl === '0x2::sui::SUI') return <IconSui size={14} />;

  // fallback to type
  return iconOfType(v?.varType);
}
