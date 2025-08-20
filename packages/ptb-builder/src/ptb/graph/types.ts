// types.ts

/** -------- Numeric widths (for precise Move-side types) -------- */
export type NumericWidth = 'u8' | 'u16' | 'u32' | 'u64' | 'u128' | 'u256';

/** -------- Scalars (simplified for UI) --------
 * In the UI we only expose a unified 'number' type.
 */
export type PTBScalar = 'bool' | 'string' | 'address' | 'number';

/** -------- Objects (simplified) -------- */
export type PTBObjectKind = 'object' | 'coin' | 'objectRef';

/** -------- Type Algebraic Data Type (ADT) --------
 * - scalar('number'): the unified UI number
 * - move_numeric: precise numeric type required by MoveCall ports
 */
export type PTBType =
  | { kind: 'scalar'; name: PTBScalar }
  | { kind: 'move_numeric'; width: NumericWidth }
  | { kind: 'object'; name: PTBObjectKind; typeArgs?: string[] }
  | { kind: 'vector'; elem: PTBType }
  | { kind: 'tuple'; elems: PTBType[] }
  | { kind: 'unknown' };

/** -------- Ports -------- */
export type PortDirection = 'in' | 'out';
export type PortRole = 'flow' | 'io';
export interface Port {
  id: string; // e.g. "prev", "next", "in_coin", "out_0"
  direction: PortDirection;
  role: PortRole;
  dataType?: PTBType; // optional type annotation for validation
}

/** -------- Nodes -------- */
export interface NodeBase {
  id: string;
  kind: 'Start' | 'End' | 'Command' | 'Variable' | 'Utility';
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
  | 'publish';

export interface StartNode extends NodeBase {
  kind: 'Start';
}
export interface EndNode extends NodeBase {
  kind: 'End';
}

export interface CommandNode extends NodeBase {
  kind: 'Command';
  command: CommandKind;
  params?: Record<string, unknown>;
  outputs?: string[];
}

export interface VariableNode extends NodeBase {
  kind: 'Variable';
  varType: PTBType; // UI always uses unified scalar('number')
  name: string;
  value?: unknown;
}

export interface UtilityNode extends NodeBase {
  kind: 'Utility';
  util: 'vector' | 'group' | 'cast';
  params?: Record<string, unknown>;
}

export type PTBNode =
  | StartNode
  | EndNode
  | CommandNode
  | VariableNode
  | UtilityNode;

/** -------- Edges -------- */
export type EdgeKind = 'flow' | 'io';
export interface PTBEdge {
  id: string;
  kind: EdgeKind;
  source: string;
  sourcePort: string;
  target: string;
  targetPort: string;
  dataType?: PTBType;

  /** Casting metadata used when number → move_numeric */
  cast?: { to: NumericWidth };
}

/** -------- Graph -------- */
export interface PTBGraph {
  nodes: PTBNode[];
  edges: PTBEdge[];
}

/** -------- Serialization helpers -------- */
export function serializePTBType(t: PTBType): string {
  switch (t.kind) {
    case 'scalar':
      return t.name;
    case 'move_numeric':
      return t.width;
    case 'vector':
      return `vector<${serializePTBType(t.elem)}>`;
    case 'object': {
      const args = t.typeArgs?.length ? `<${t.typeArgs.join(',')}>` : '';
      return `${t.name}${args}`;
    }
    case 'tuple':
      return `(${t.elems.map(serializePTBType).join(',')})`;
    case 'unknown':
      return 'unknown';
    default: {
      const _exhaustive: never = t;
      return String(_exhaustive);
    }
  }
}
