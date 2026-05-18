import React from 'react';

import type { PTBType, VariableNode } from '@zktx.io/ptb-model';
import {
  AtSign,
  BookA,
  Box,
  Brackets,
  Calculator,
  CircleQuestionMark,
  Download,
  Fuel,
  FunctionSquare,
  Hash,
  Merge,
  Power,
  Split,
} from 'lucide-react';

/** Resolve an icon for a PTBType (vector unwraps to its element type) */
function iconOfType(t?: PTBType): React.ReactNode {
  if (!t) return <CircleQuestionMark size={14} />;

  if (t.kind === 'vector') {
    // unwrap vector → show element type icon only
    return iconOfType(t.elem);
  }

  if (t.kind === 'option') {
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

/** Resolve an icon for a variable node based on explicit semantics/type. */
export function iconOfVar(v?: VariableNode): React.ReactNode {
  if (v?.semantic?.kind === 'GasCoin') return <Fuel size={14} />;

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
