// src/ptb/graph/types.ts

/** ------------------------------------------------------------------
 * Numeric widths (Move-precise)
 * ----------------------------------------------------------------- */
export type NumericWidth = 'u8' | 'u16' | 'u32' | 'u64' | 'u128' | 'u256';

/** ------------------------------------------------------------------
 * Scalars (UI simplified; tx.pure aligned)
 * - 'id' is for object IDs via tx.pure.id(...).
 * - 'number' is a UI convenience that can cast to move_numeric on demand.
 * ----------------------------------------------------------------- */
export type PTBScalar = 'bool' | 'string' | 'address' | 'id' | 'number';

/** ------------------------------------------------------------------
 * ADT for PTB types
 * - 'option' models Option<T> (pure option).
 * - 'vector' models vector<T>; nested vectors are disallowed by policy.
 * - 'object' is non-pure (owned/shared refs), optional typeTag for specificity.
 * - 'tuple' can appear in ABI outputs (non-pure for tx.pure).
 * - 'typeparam' is a generic placeholder (compatible with anything).
 * ----------------------------------------------------------------- */
export type PTBType =
  | { kind: 'scalar'; name: PTBScalar }
  | { kind: 'move_numeric'; width: NumericWidth }
  | { kind: 'object'; typeTag?: string }
  | { kind: 'vector'; elem: PTBType }
  | { kind: 'option'; elem: PTBType }
  | { kind: 'tuple'; elems: PTBType[] }
  | { kind: 'typeparam'; name: string }
  | { kind: 'unknown' };

/** ------------------------------------------------------------------
 * Ports
 * ----------------------------------------------------------------- */
export type PortDirection = 'in' | 'out';
export type PortRole = 'flow' | 'io';

export interface Port {
  id: string;
  direction: PortDirection;
  role: PortRole;
  /** Structured type carried by the handle (IO only). */
  dataType?: PTBType;
  /** Optional pre-serialized type hint (overrides serializePTBType for UI badges). */
  typeStr?: string;
  /** Optional handle label shown next to the port. */
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

/** ------------------------------------------------------------------
 * Command kinds
 * - Core: splitCoins, mergeCoins, transferObjects, moveCall, makeMoveVec
 * - Graph-only (decode/replay): publish, upgrade
 * ----------------------------------------------------------------- */
export type CommandKind =
  | 'splitCoins'
  | 'mergeCoins'
  | 'transferObjects'
  | 'moveCall'
  | 'makeMoveVec'
  | 'publish'
  | 'upgrade';

/** ------------------------------------------------------------------
 * Command UI params
 * - Counters for expandable inputs.
 * - Extra fields for publish/upgrade (graph-only commands).
 * ----------------------------------------------------------------- */
export interface CommandUIParams {
  // Core commands
  amountsCount?: number; // splitCoins outputs (N coins)
  sourcesCount?: number; // mergeCoins inputs
  objectsCount?: number; // transferObjects inputs
  elemsCount?: number; // makeMoveVec inputs (when expanded)
  elemType?: PTBType; // makeMoveVec element type

  // Publish/Upgrade commands (graph-only)
  modulesCount?: number; // vector<vector<u8>> length
  depsCount?: number; // vector<address> length
  policyWidth?: NumericWidth; // policy width (default u8)
  readOnly?: boolean; // if true, disable editing (decode-only)
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
  /** Named outputs produced by the command (for codegen/labels). */
  outputs?: string[];
}

export interface VariableNode extends NodeBase {
  kind: 'Variable';
  /** Should align to tx.pure for pure types; object is non-pure. */
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
  /** number → move_numeric (UI-driven cast hint for codegen). */
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
 * - For 'typeparam', emit its name (e.g., "T0").
 * - For 'option', emit `option<...>`.
 * ----------------------------------------------------------------- */
export function serializePTBType(t: PTBType): string {
  switch (t.kind) {
    case 'scalar':
      return t.name;
    case 'move_numeric':
      return t.width;
    case 'vector':
      return `vector<${serializePTBType(t.elem)}>`;
    case 'option':
      return `option<${serializePTBType(t.elem)}>`;
    case 'object':
      return t.typeTag ? `object<${t.typeTag}>` : 'object';
    case 'tuple':
      return `(${t.elems.map(serializePTBType).join(',')})`;
    case 'typeparam':
      return t.name;
    case 'unknown':
      return 'unknown';
    default: {
      const _exhaustive: never = t;
      return String(_exhaustive);
    }
  }
}

/** ------------------------------------------------------------------
 * Lightweight graph helpers
 * ----------------------------------------------------------------- */

/** Find a port by id on a node (undefined if not found). */
export const findPort = (node: PTBNode, portId: string) =>
  node.ports.find((p) => p.id === portId);

/**
 * Build a React Flow handle id with an inline serialized type suffix for IO.
 * Examples:
 *   - "in_coin:object<0x2::coin::Coin<0x2::sui::SUI>>"
 *   - "in_amounts:vector<number>"
 *   - "out_vec:vector<object>"
 *
 * Notes:
 * - For non-IO handles (flow), returns the plain id without suffix.
 * - We intentionally ignore `port.typeStr` for the id; it's only for UI badges.
 * - If `dataType.kind === 'typeparam'`, the suffix will be that name (e.g., "T0").
 * - For missing/unknown types, skip the suffix to keep the id stable.
 */
export function buildHandleId(port: Port): string {
  if (port.role !== 'io') return port.id;
  const t = port.dataType;
  if (!t || t.kind === 'unknown') return port.id;
  const raw = serializePTBType(t);
  const typeStr =
    typeof raw === 'string' ? raw.trim().replace(/\s+/g, ' ') : undefined;
  return typeStr ? `${port.id}:${typeStr}` : port.id;
}

/** Parse "handleId[:TypeString]" into base id and optional type string. */
export function parseHandleTypeSuffix(handleId?: string): {
  baseId?: string;
  typeStr?: string;
} {
  if (!handleId) return { baseId: undefined, typeStr: undefined };
  const raw = String(handleId);
  const idx = raw.indexOf(':');
  if (idx < 0) return { baseId: raw, typeStr: undefined };
  return { baseId: raw.slice(0, idx), typeStr: raw.slice(idx + 1) };
}

/**
 * Extract the base port id from a React Flow handle id.
 *
 * Example:
 *   - "in_coin:object<0x2::coin::Coin<0x2::sui::SUI>>" → "in_coin"
 *   - "out_vec:vector<object>" → "out_vec"
 *   - "flow_next" → "flow_next" (no suffix to strip)
 *
 * Internally this uses parseHandleTypeSuffix(), which splits "id[:type]".
 * Useful when matching against Port.id, since Port.id never includes the type suffix.
 */
export const portIdOf = (handle?: string) =>
  parseHandleTypeSuffix(handle).baseId;
