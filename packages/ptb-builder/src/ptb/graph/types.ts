// src/ptb/graph/types.ts

/** ------------------------------------------------------------------
 * Numeric widths (Move-precise)
 * ----------------------------------------------------------------- */
export type NumericWidth = 'u8' | 'u16' | 'u32' | 'u64' | 'u128' | 'u256';

/** ------------------------------------------------------------------
 * Scalars (UI simplified)
 * - UI exposes a unified 'number'; on-chain precise widths use 'move_numeric'.
 * ----------------------------------------------------------------- */
export type PTBScalar = 'bool' | 'string' | 'address' | 'number';

/** ------------------------------------------------------------------
 * ADT for PTB types
 * - New: 'typeparam' represents a Move type parameter (e.g., "T0", "T1").
 *   The 'name' should be the canonical identifier like "T0", "T1", etc.
 *   In UI, this behaves like a scalar (single cardinality).
 * ----------------------------------------------------------------- */
export type PTBType =
  | { kind: 'scalar'; name: PTBScalar }
  | { kind: 'move_numeric'; width: NumericWidth }
  | { kind: 'object'; typeTag?: string }
  | { kind: 'vector'; elem: PTBType }
  | { kind: 'tuple'; elems: PTBType[] }
  | { kind: 'typeparam'; name: string }
  | { kind: 'unknown' };

/** ------------------------------------------------------------------
 * Ports
 * - role 'io' is shared for both value-arguments and type-arguments.
 *   Distinguish by inspecting dataType.kind === 'typeparam' downstream.
 * ----------------------------------------------------------------- */
export type PortDirection = 'in' | 'out';
export type PortRole = 'flow' | 'io';

export interface Port {
  id: string;
  direction: PortDirection;
  role: PortRole;
  /** Structured type carried by the handle (IO only) */
  dataType?: PTBType;
  /** Optional pre-serialized type hint (overrides serializePTBType for UI badges) */
  typeStr?: string;
  /** Optional handle label shown next to the port */
  label?: string;
}

/** ------------------------------------------------------------------
 * Nodes
 * ----------------------------------------------------------------- */
export interface NodeBase {
  id: string;
  kind: 'Start' | 'End' | 'Command' | 'Variable';
  label?: string;
  ports: Port[];
  position?: { x: number; y: number };
}

export type CommandKind =
  | 'splitCoins'
  | 'mergeCoins'
  | 'transferObjects'
  | 'moveCall'
  | 'makeMoveVec'
  | 'publish'
  | 'upgrade';

/** UI cardinality for handles/ports */
export type UICardinality = 'single' | 'multi';

/** ------------------------------------------------------------------
 * Command UI params (policy-applied)
 * ----------------------------------------------------------------- */
export interface CommandUIParams {
  /** SplitCoins: amounts are always multi; expanded controls vector vs. N singles. */
  amountsExpanded?: boolean;
  amountsCount?: number;

  /** MergeCoins: sources vector vs. expanded-many (count drives N when expanded). */
  sourcesExpanded?: boolean;
  sourcesCount?: number;

  /** TransferObjects: objects vector vs. expanded-many (count drives N when expanded). */
  objectsExpanded?: boolean;
  objectsCount?: number;

  /** MakeMoveVec: elems vector vs. expanded-many (count drives N when expanded); elem type for T. */
  elemsExpanded?: boolean;
  elemsCount?: number;
  elemType?: PTBType;
}

export interface StartNode extends NodeBase {
  kind: 'Start';
}
export interface EndNode extends NodeBase {
  kind: 'End';
}

export interface CommandNode extends NodeBase {
  kind: 'Command';
  command: CommandKind;
  params?: {
    runtime?: Record<string, unknown>;
    ui?: CommandUIParams;
  };
  /** Optional: named outputs produced by the command (for codegen/labels) */
  outputs?: string[];
}

export interface VariableNode extends NodeBase {
  kind: 'Variable';
  varType: PTBType;
  name: string;
  value?: unknown;
}

export type PTBNode = StartNode | EndNode | CommandNode | VariableNode;

/** ------------------------------------------------------------------
 * Edges
 * ----------------------------------------------------------------- */
export type EdgeKind = 'flow' | 'io';
export interface PTBEdge {
  id: string;
  kind: EdgeKind;
  source: string;
  sourceHandle: string;
  target: string;
  targetHandle: string;
  /** number → move_numeric (UI-driven cast hint for codegen) */
  cast?: { to: NumericWidth };
}

/** ------------------------------------------------------------------
 * Graph
 * ----------------------------------------------------------------- */
export interface PTBGraph {
  nodes: PTBNode[];
  edges: PTBEdge[];
}

/** ------------------------------------------------------------------
 * Serialization helpers
 * - Returned string is used for UI badges / debug.
 * - For 'typeparam', we emit its name (e.g., "T0").
 * ----------------------------------------------------------------- */
export function serializePTBType(t: PTBType): string {
  switch (t.kind) {
    case 'scalar':
      return t.name;
    case 'move_numeric':
      return t.width;
    case 'vector':
      return `vector<${serializePTBType(t.elem)}>`;
    case 'object':
      return t.typeTag ? `object<${t.typeTag}>` : 'object';
    case 'tuple':
      return `(${t.elems.map(serializePTBType).join(',')})`;
    case 'typeparam':
      return t.name; // e.g., "T0"
    case 'unknown':
      return 'unknown';
    default: {
      const _exhaustive: never = t;
      return String(_exhaustive);
    }
  }
}

/** ------------------------------------------------------------------
 * UI helpers
 * - 'typeparam' behaves like a scalar from a cardinality perspective.
 * ----------------------------------------------------------------- */
export function uiCardinalityOf(t?: PTBType): UICardinality {
  if (!t) return 'single';
  switch (t.kind) {
    case 'vector':
      return 'multi';
    case 'tuple':
      if (t.elems.length === 0) return 'single';
      if (t.elems.length === 1) return uiCardinalityOf(t.elems[0]);
      return 'multi';
    default:
      return 'single';
  }
}
