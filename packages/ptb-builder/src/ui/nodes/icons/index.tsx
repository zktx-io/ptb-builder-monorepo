import React from 'react';

import {
  AtSign,
  BookA,
  Box,
  Brackets,
  Calculator,
  CircleQuestionMark,
  Clock,
  Cog,
  Dices,
  Download,
  Fuel,
  FunctionSquare,
  Hash,
  Merge,
  Power,
  Split,
  Wallet,
} from 'lucide-react';

import { IconSui } from './IconSui';
import { PTBType, VariableNode } from '../../../ptb/graph/types';

/** Resolve an icon for a PTBType (vector unwraps to its element type) */
function iconOfType(t?: PTBType): React.ReactNode {
  if (!t) return <CircleQuestionMark size={14} />;

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
      if (t.name === 'address') return <AtSign size={14} />;
      if (t.name === 'bool') return <Power size={14} />;
      if (t.name === 'number') return <Calculator size={14} />;
      if (t.name === 'string') return <BookA size={14} />;
      if (t.name === 'id') return <Hash size={14} />;
      return <CircleQuestionMark size={14} />;
    default:
      return <CircleQuestionMark size={14} />;
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

/** Resolve an icon for a command node based on its kind */
export function iconOfCommand(kind?: string) {
  switch (kind) {
    case 'splitCoins':
      return <Split size={14} />;
    case 'mergeCoins':
      return <Merge size={14} />;
    case 'transferObjects':
      return <Download size={14} />;
    case 'makeMoveVec':
      return <Brackets size={14} />;
    case 'moveCall':
      return <FunctionSquare size={14} />;
    default:
      return <></>;
  }
}
