// src/ui/nodes/vars/varUtils.ts
// Small helpers used by VarNode and other var-related UIs.

import type { Port, PTBType, VariableNode } from '../../../ptb/graph/types';
import { serializePTBType } from '../../../ptb/graph/types';

/** Build an IO out port with a human-friendly typeStr hint */
export function buildOutPort(v?: VariableNode): Port {
  const t = v?.varType;

  // Ensure we preserve full PTBType including object.typeTag and vector elem tags
  const dataType: PTBType | undefined = t
    ? JSON.parse(JSON.stringify(t)) // deep-clone safety if needed
    : undefined;

  // Optional: human-friendly string for tooltip/badge
  const typeStr = t ? serializePTBType(t) : undefined; // if you have this helper here

  return {
    id: 'out', // or VAR_OUT constant your system uses
    role: 'io',
    direction: 'out',
    label: v?.name || 'out',
    dataType, // ← MUST include object.typeTag / vector elem tags
    typeStr, // ← UI-only hint
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
