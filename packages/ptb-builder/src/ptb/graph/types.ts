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
 * - 'vector' models vector<T>; nested vectors are disallowed by policy.
 * - 'option' kept in the model for future use, but CURRENTLY UNSUPPORTED:
 *   resolver should not emit option; if it appears, treat as unknown at wiring.
 * - 'object' is non-pure (owned/shared refs), optional typeTag for specificity.
 * - 'tuple' can appear in ABI outputs (non-pure for tx.pure).
 * - NOTE: generic placeholders ('typeparam') are REMOVED by policy.
 *   Generics are resolved exclusively via typeArguments: string[] (SSOT).
 * ----------------------------------------------------------------- */
export type PTBType =
  | { kind: 'scalar'; name: PTBScalar }
  | { kind: 'move_numeric'; width: NumericWidth }
  | { kind: 'object'; typeTag?: string }
  | { kind: 'vector'; elem: PTBType }
  | { kind: 'option'; elem: PTBType } // kept for future, but not used by resolver now
  | { kind: 'tuple'; elems: PTBType[] }
  | { kind: 'unknown'; debugInfo?: string };

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
 * - For 'option', emit `option<...>` (though resolver should not output it now).
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
    case 'unknown':
      return t.debugInfo ? `unknown (${t.debugInfo})` : 'unknown';
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
 * Build a stable React Flow handle id for IO ports using a coarse type suffix.
 *
 * Rationale:
 * - Keep IDs stable across ABI changes while still preventing obvious mis-wires.
 * - Use only broad categories so UI badges can be rich, but edges don’t break.
 *
 * Policy:
 * - Non-IO ports (flow) → return plain id.
 * - object<T> → `${id}:object`   (drop concrete typeTag)
 * - scalar(name) → `${id}:${name}`  where name ∈ { address | bool | string | number }
 * - move_numeric (u8..u256) → treat as number → `${id}:number`
 * - vector<scalar/move_numeric/object> → `${id}:vector<name>` with name mapped above
 * - Anything else (tuple/unknown/nested vectors) → plain id (no suffix)
 */
export function buildHandleId(port: Port): string {
  if (port.role !== 'io') return port.id;

  const t = port.dataType;
  if (!t) return port.id;

  const base = port.id;

  switch (t.kind) {
    case 'object':
      // Drop concrete type tags to avoid mismatches like object<0x2::…>
      return `${base}:object`;

    case 'scalar':
      // address | bool | string | number
      return `${base}:${t.name}`;

    case 'move_numeric':
      // Normalize all Move numerics to number
      return `${base}:number`;

    case 'vector': {
      const e = t.elem;
      if (e.kind === 'scalar') {
        return `${base}:vector<${e.name}>`; // e.g. vector<number>, vector<address>
      }
      if (e.kind === 'move_numeric') {
        return `${base}:vector<number>`;
      }
      if (e.kind === 'object') {
        return `${base}:vector<object>`;
      }
      // For nested/complex vectors, keep id stable without suffix
      return base;
    }

    // tuple, unknown, etc. → no suffix
    default:
      return base;
  }
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
