// src/ui/nodes/vars/varUtils.ts
// Small helpers used by VarNode and other var-related UIs.

import { isVector } from '../../../ptb/graph/typecheck';
import type { Port, PTBType, VariableNode } from '../../../ptb/graph/types';
import { serializePTBType } from '../../../ptb/graph/types';
import { VAR_OUT } from '../../../ptb/portTemplates';

/** Build an IO out port with a human-friendly typeStr hint */
export function buildOutPort(v?: VariableNode): Port {
  let typeStrHint: string | undefined;

  if (v?.varType && isVector(v.varType)) {
    const elemStr = serializePTBType(v.varType.elem);
    typeStrHint = `vector<${elemStr}>`;
  } else if (v?.varType) {
    typeStrHint = serializePTBType(v.varType);
  }

  return {
    id: VAR_OUT,
    role: 'io',
    direction: 'out',
    dataType: v?.varType,
    ...(typeStrHint ? { typeStr: typeStrHint } : {}),
  };
}

/** Placeholder text by PTBType (recurses into vector elem) */
export function placeholderFor(t?: PTBType): string {
  if (!t) return 'value';

  if (t.kind === 'scalar') {
    if (t.name === 'address') return '0x...';
    if (t.name === 'number') return 'number';
    if (t.name === 'bool') return 'true|false';
    return 'value';
  }

  if (t.kind === 'object') return 'object id (0x...)';

  if (t.kind === 'move_numeric') return t.width; // e.g. "u64"

  if (t.kind === 'vector') return placeholderFor(t.elem);

  return 'value';
}
