// src/ui/nodes/vars/varUtils.ts
// Small helpers used by VarNode and other var-related UIs.

import type { Port, PTBType, VariableNode } from '../../../ptb/graph/types';
import { serializePTBType } from '../../../ptb/graph/types';
import { VAR_OUT } from '../../../ptb/portTemplates';

/** Build a variable's single IO out-port with stable type metadata. */
export function buildOutPort(v?: VariableNode): Port {
  const t = v?.varType;

  // Preserve full PTBType including object.typeTag and vector element tags.
  const dataType: PTBType | undefined = t
    ? typeof structuredClone === 'function'
      ? structuredClone(t)
      : JSON.parse(JSON.stringify(t))
    : undefined;

  // Human-friendly string used for tooltip/badge only (UI hint).
  const typeStr = t ? serializePTBType(t) : undefined;

  return {
    id: VAR_OUT,
    role: 'io',
    direction: 'out',
    label: v?.name || 'out',
    dataType, // ← MUST include object.typeTag / vector elem tags
    typeStr, // ← UI-only hint
  };
}

/** Placeholder text by PTBType (recurses into vector element). */
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
