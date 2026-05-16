import { normalizeGraphRawInput } from './rawInput.js';
import { errorDiagnostic, freezeDiagnostics } from '../ir/diagnostics.js';
import type { TransactionDiagnostic } from '../ir/diagnostics.js';
import type { RawCallArg } from '../raw/types.js';
import {
  isDenseArray,
  isFiniteNumber,
  isRecord,
  NULL_VALUE,
} from '../utils.js';

export type NumericWidth = 'u8' | 'u16' | 'u32' | 'u64' | 'u128' | 'u256';
export type PTBScalar = 'bool' | 'string' | 'address' | 'id' | 'number';

export type PTBType =
  | { kind: 'scalar'; name: PTBScalar }
  | { kind: 'move_numeric'; width: NumericWidth }
  | { kind: 'object'; typeTag?: string }
  | { kind: 'vector'; elem: PTBType }
  | { kind: 'option'; elem: PTBType }
  | { kind: 'tuple'; elems: PTBType[] }
  | { kind: 'unknown'; debugInfo?: string };

export type PortDirection = 'in' | 'out';
export type PortRole = 'flow' | 'io';

export interface Port {
  id: string;
  direction: PortDirection;
  role: PortRole;
  dataType?: PTBType;
  typeStr?: string;
  label?: string;
}

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
  | 'upgrade'
  | 'unsupported';

export interface CommandUIParams {
  amountsCount?: number;
  sourcesCount?: number;
  objectsCount?: number;
  elemsCount?: number;
  modulesCount?: number;
  depsCount?: number;
  policyWidth?: NumericWidth;
  readOnly?: boolean;
}

export interface CommandRuntimeParams {
  target?: string;
  typeArguments?: string[];
  type?: string | typeof NULL_VALUE;
  modules?: string[];
  dependencies?: string[];
  package?: string;
  sourceKind?: string;
  value?: unknown;
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
    runtime?: CommandRuntimeParams;
    ui?: CommandUIParams;
  };
}

export interface VariableNode extends NodeBase {
  kind: 'Variable';
  varType: PTBType;
  name: string;
  value?: unknown;
  rawInput?: RawCallArg;
  semantic?:
    | { kind: 'GasCoin' }
    | { kind: 'UnsupportedInput'; sourceKind: string };
}

export type PTBNode = StartNode | EndNode | CommandNode | VariableNode;

export type EdgeKind = 'flow' | 'io';

export interface PTBEdge {
  id: string;
  kind: EdgeKind;
  source: string;
  sourceHandle: string;
  target: string;
  targetHandle: string;
  cast?: { to: NumericWidth };
}

export interface PTBGraph {
  nodes: PTBNode[];
  edges: PTBEdge[];
}

const NODE_KINDS = ['Start', 'End', 'Command', 'Variable'] as const;
const COMMAND_KINDS = [
  'splitCoins',
  'mergeCoins',
  'transferObjects',
  'moveCall',
  'makeMoveVec',
  'publish',
  'upgrade',
  'unsupported',
] as const;
const EDGE_KINDS = ['flow', 'io'] as const;
const PORT_DIRECTIONS = ['in', 'out'] as const;
const PORT_ROLES = ['flow', 'io'] as const;
const TYPE_KINDS = [
  'scalar',
  'move_numeric',
  'object',
  'vector',
  'option',
  'tuple',
  'unknown',
] as const;
const SCALARS = ['bool', 'string', 'address', 'id', 'number'] as const;
const NUMERIC_WIDTHS = ['u8', 'u16', 'u32', 'u64', 'u128', 'u256'] as const;
const GRAPH_KEYS = ['nodes', 'edges'] as const;
const NODE_BASE_KEYS = ['id', 'kind', 'label', 'ports', 'position'] as const;
const START_NODE_KEYS = NODE_BASE_KEYS;
const END_NODE_KEYS = NODE_BASE_KEYS;
const COMMAND_NODE_KEYS = [...NODE_BASE_KEYS, 'command', 'params'] as const;
const VARIABLE_NODE_KEYS = [
  ...NODE_BASE_KEYS,
  'varType',
  'name',
  'value',
  'rawInput',
  'semantic',
] as const;
const PORT_KEYS = [
  'id',
  'direction',
  'role',
  'dataType',
  'typeStr',
  'label',
] as const;
const EDGE_KEYS = [
  'id',
  'kind',
  'source',
  'sourceHandle',
  'target',
  'targetHandle',
  'cast',
] as const;
const EDGE_CAST_KEYS = ['to'] as const;
const POSITION_KEYS = ['x', 'y'] as const;
const GAS_COIN_SEMANTIC_KEYS = ['kind'] as const;
const UNSUPPORTED_INPUT_SEMANTIC_KEYS = ['kind', 'sourceKind'] as const;
const TYPE_KEYS_BY_KIND = {
  scalar: ['kind', 'name'],
  move_numeric: ['kind', 'width'],
  object: ['kind', 'typeTag'],
  vector: ['kind', 'elem'],
  option: ['kind', 'elem'],
  tuple: ['kind', 'elems'],
  unknown: ['kind', 'debugInfo'],
} as const satisfies Record<(typeof TYPE_KINDS)[number], readonly string[]>;
const COMMAND_PARAM_KEYS = ['runtime', 'ui'] as const;
const COMMAND_RUNTIME_KEYS_BY_KIND = {
  splitCoins: [],
  mergeCoins: [],
  transferObjects: [],
  moveCall: ['target', 'typeArguments'],
  makeMoveVec: ['type'],
  publish: ['modules', 'dependencies'],
  upgrade: ['modules', 'dependencies', 'package'],
  unsupported: ['sourceKind', 'value'],
} as const satisfies Record<CommandKind, readonly string[]>;
const COMMAND_UI_COUNT_KEYS = [
  'amountsCount',
  'sourcesCount',
  'objectsCount',
  'elemsCount',
  'modulesCount',
  'depsCount',
] as const;
const COMMAND_UI_KEYS = [
  ...COMMAND_UI_COUNT_KEYS,
  'policyWidth',
  'readOnly',
] as const;

interface GraphNodeIndex {
  kind: PTBNode['kind'];
  ports: Map<string, Port>;
}

export function validatePTBGraph(
  value: unknown,
  path = '$',
): readonly TransactionDiagnostic[] {
  const diagnostics: TransactionDiagnostic[] = [];

  if (!isRecord(value)) {
    diagnostics.push(
      errorDiagnostic('graph.invalid', 'PTB graph must be an object.', path),
    );
    return freezeDiagnostics(diagnostics);
  }

  validateUnknownFields(
    value,
    GRAPH_KEYS,
    'graph.unknownField',
    path,
    'PTB graph',
    diagnostics,
  );

  const nodeValues = value.nodes;
  const edgeValues = value.edges;
  const nodesAreDense = isDenseArray(nodeValues);
  const edgesAreDense = isDenseArray(edgeValues);

  if (!nodesAreDense) {
    diagnostics.push(
      errorDiagnostic(
        'graph.nodes',
        'PTB graph must have dense nodes and edges arrays.',
        `${path}.nodes`,
      ),
    );
  } else {
    nodeValues.forEach((node, index) => {
      validateNode(node, `${path}.nodes[${index}]`, diagnostics);
    });
  }

  if (!edgesAreDense) {
    diagnostics.push(
      errorDiagnostic(
        'graph.edges',
        'PTB graph must have dense nodes and edges arrays.',
        `${path}.edges`,
      ),
    );
  } else {
    edgeValues.forEach((edge, index) => {
      validateEdge(edge, `${path}.edges[${index}]`, diagnostics);
    });
  }

  if (nodesAreDense && edgesAreDense) {
    validateGraphReferences(nodeValues, edgeValues, path, diagnostics);
  }

  return freezeDiagnostics(diagnostics);
}

export function isPTBGraph(value: unknown): value is PTBGraph {
  return validatePTBGraph(value).length === 0;
}

export function validatePTBType(
  value: unknown,
  path = '$',
): readonly TransactionDiagnostic[] {
  const diagnostics: TransactionDiagnostic[] = [];
  validatePTBTypeShape(value, path, diagnostics, new WeakSet<object>());
  return freezeDiagnostics(diagnostics);
}

export function isPTBType(value: unknown): value is PTBType {
  return validatePTBType(value).length === 0;
}

function validateNode(
  value: unknown,
  path: string,
  diagnostics: TransactionDiagnostic[],
): void {
  if (!isRecord(value)) {
    diagnostics.push(
      errorDiagnostic('graph.node', 'PTB graph node must be an object.', path),
    );
    return;
  }

  if (typeof value.id !== 'string') {
    diagnostics.push(
      errorDiagnostic(
        'graph.node.id',
        'PTB graph node id must be a string.',
        `${path}.id`,
      ),
    );
  }

  if (!isOneOf(value.kind, NODE_KINDS)) {
    diagnostics.push(
      errorDiagnostic(
        'graph.node.kind',
        'PTB graph node kind is not supported.',
        `${path}.kind`,
      ),
    );
    return;
  }

  validateUnknownFields(
    value,
    nodeKeysForKind(value.kind),
    'graph.node.unknownField',
    path,
    'PTB graph node',
    diagnostics,
  );

  if (!isDenseArray(value.ports)) {
    diagnostics.push(
      errorDiagnostic(
        'graph.node.ports',
        'PTB graph node ports must be a dense array.',
        `${path}.ports`,
      ),
    );
  } else {
    value.ports.forEach((port, index) => {
      validatePort(port, `${path}.ports[${index}]`, diagnostics);
    });
  }

  validateOptionalStringField(
    value.label,
    `${path}.label`,
    'graph.node.label',
    'PTB graph node label must be a string when present.',
    diagnostics,
  );
  validateOptionalPosition(value.position, `${path}.position`, diagnostics);

  if (value.kind === 'Command') {
    validateCommandNode(value, path, diagnostics);
  }

  if (value.kind === 'Variable') {
    validateVariableNode(value, path, diagnostics);
  }
}

function validateCommandNode(
  value: Record<string, unknown>,
  path: string,
  diagnostics: TransactionDiagnostic[],
): void {
  const commandKind = isOneOf(value.command, COMMAND_KINDS)
    ? value.command
    : undefined;
  if (commandKind === undefined) {
    diagnostics.push(
      errorDiagnostic(
        'graph.command.kind',
        'PTB graph command kind is not supported.',
        `${path}.command`,
      ),
    );
  }
  validateCommandParams(
    value.params,
    commandKind,
    `${path}.params`,
    diagnostics,
  );
}

function validateVariableNode(
  value: Record<string, unknown>,
  path: string,
  diagnostics: TransactionDiagnostic[],
): void {
  if (typeof value.name !== 'string') {
    diagnostics.push(
      errorDiagnostic(
        'graph.variable.name',
        'PTB graph variable name must be a string.',
        `${path}.name`,
      ),
    );
  }

  validatePTBTypeShape(
    value.varType,
    `${path}.varType`,
    diagnostics,
    new WeakSet<object>(),
  );
  if (isRecord(value.varType) && value.varType.kind === 'option') {
    const hasValue = Object.prototype.hasOwnProperty.call(value, 'value');
    if (!hasValue || value.value === undefined) {
      diagnostics.push(
        errorDiagnostic(
          'graph.variable.optionValue',
          !hasValue
            ? 'PTB graph option variables must store None as null; missing value is not canonical.'
            : 'PTB graph option variables must store None as null; undefined is not canonical.',
          `${path}.value`,
        ),
      );
    }
  }
  validateVariableSemantic(value.semantic, `${path}.semantic`, diagnostics);
  normalizeGraphRawInput(value.rawInput, `${path}.rawInput`, diagnostics);
}

function validatePort(
  value: unknown,
  path: string,
  diagnostics: TransactionDiagnostic[],
): void {
  if (!isRecord(value)) {
    diagnostics.push(
      errorDiagnostic('graph.port', 'PTB graph port must be an object.', path),
    );
    return;
  }

  validateUnknownFields(
    value,
    PORT_KEYS,
    'graph.port.unknownField',
    path,
    'PTB graph port',
    diagnostics,
  );

  if (typeof value.id !== 'string') {
    diagnostics.push(
      errorDiagnostic(
        'graph.port.id',
        'PTB graph port id must be a string.',
        `${path}.id`,
      ),
    );
  }

  if (!isOneOf(value.direction, PORT_DIRECTIONS)) {
    diagnostics.push(
      errorDiagnostic(
        'graph.port.direction',
        'PTB graph port direction must be in or out.',
        `${path}.direction`,
      ),
    );
  }

  if (!isOneOf(value.role, PORT_ROLES)) {
    diagnostics.push(
      errorDiagnostic(
        'graph.port.role',
        'PTB graph port role must be flow or io.',
        `${path}.role`,
      ),
    );
  }

  if (value.dataType !== undefined) {
    validatePTBTypeShape(
      value.dataType,
      `${path}.dataType`,
      diagnostics,
      new WeakSet<object>(),
    );
  }
  validateOptionalStringField(
    value.typeStr,
    `${path}.typeStr`,
    'graph.port.field',
    'PTB graph port typeStr must be a string when present.',
    diagnostics,
  );
  validateOptionalStringField(
    value.label,
    `${path}.label`,
    'graph.port.field',
    'PTB graph port label must be a string when present.',
    diagnostics,
  );
}

function validateEdge(
  value: unknown,
  path: string,
  diagnostics: TransactionDiagnostic[],
): void {
  if (!isRecord(value)) {
    diagnostics.push(
      errorDiagnostic('graph.edge', 'PTB graph edge must be an object.', path),
    );
    return;
  }

  validateUnknownFields(
    value,
    EDGE_KEYS,
    'graph.edge.unknownField',
    path,
    'PTB graph edge',
    diagnostics,
  );

  if (typeof value.id !== 'string') {
    diagnostics.push(
      errorDiagnostic(
        'graph.edge.id',
        'PTB graph edge id must be a string.',
        `${path}.id`,
      ),
    );
  }

  if (!isOneOf(value.kind, EDGE_KINDS)) {
    diagnostics.push(
      errorDiagnostic(
        'graph.edge.kind',
        'PTB graph edge kind must be flow or io.',
        `${path}.kind`,
      ),
    );
  }

  ['source', 'sourceHandle', 'target', 'targetHandle'].forEach((key) => {
    if (typeof value[key] !== 'string') {
      diagnostics.push(
        errorDiagnostic(
          'graph.edge.endpoint',
          `PTB graph edge ${key} must be a string.`,
          `${path}.${key}`,
        ),
      );
    }
  });
  validateEdgeCast(value.cast, `${path}.cast`, diagnostics);
}

function validateFlowTopology(
  nodes: unknown[],
  edges: unknown[],
  path: string,
  diagnostics: TransactionDiagnostic[],
): void {
  const typedNodes = nodes
    .map((node, index) =>
      isRecord(node) &&
      typeof node.id === 'string' &&
      isOneOf(node.kind, NODE_KINDS)
        ? { id: node.id, kind: node.kind, path: `${path}.nodes[${index}]` }
        : undefined,
    )
    .filter(
      (node): node is { id: string; kind: PTBNode['kind']; path: string } =>
        node !== undefined,
    );
  const starts = typedNodes.filter((node) => node.kind === 'Start');
  const ends = typedNodes.filter((node) => node.kind === 'End');
  const commands = typedNodes.filter((node) => node.kind === 'Command');
  const hasDeclaredFlow =
    starts.length > 0 ||
    ends.length > 0 ||
    edges.some((edge) => isRecord(edge) && edge.kind === 'flow');

  if (!hasDeclaredFlow) return;

  if (starts.length !== 1) {
    diagnostics.push(
      errorDiagnostic(
        'graph.flow.start',
        'PTB graph must contain exactly one Start node.',
        `${path}.nodes`,
      ),
    );
  }
  if (ends.length !== 1) {
    diagnostics.push(
      errorDiagnostic(
        'graph.flow.end',
        'PTB graph must contain exactly one End node.',
        `${path}.nodes`,
      ),
    );
  }
  if (starts.length !== 1 || ends.length !== 1) return;

  // Duplicate flow sources are reported by validateGraphReferences; a clean
  // declared flow graph has at most one outgoing flow edge per node.
  const outgoing = new Map<string, string>();
  edges.forEach((edge) => {
    if (
      isRecord(edge) &&
      edge.kind === 'flow' &&
      typeof edge.source === 'string' &&
      typeof edge.target === 'string' &&
      !outgoing.has(edge.source)
    ) {
      outgoing.set(edge.source, edge.target);
    }
  });

  const nodeIds = new Set(typedNodes.map((node) => node.id));
  const visited = new Set<string>();
  let current = starts[0].id;
  let stoppedBeforeEnd = false;
  while (!visited.has(current)) {
    visited.add(current);
    if (current === ends[0].id) break;
    const next = outgoing.get(current);
    if (next === undefined || !nodeIds.has(next)) {
      stoppedBeforeEnd = true;
      diagnostics.push(
        errorDiagnostic(
          'graph.flow.path',
          'PTB graph flow must connect Start through commands to End.',
          starts[0].path,
        ),
      );
      break;
    }
    current = next;
  }

  if (!stoppedBeforeEnd && current !== ends[0].id && visited.has(current)) {
    diagnostics.push(
      errorDiagnostic(
        'graph.flow.cycle',
        'PTB graph flow must not contain a cycle.',
        starts[0].path,
      ),
    );
  }

  commands.forEach((command) => {
    if (visited.has(command.id)) return;
    diagnostics.push(
      errorDiagnostic(
        'graph.flow.disconnected',
        `Command node ${command.id} is not connected to the Start-to-End flow path.`,
        command.path,
      ),
    );
  });
}

function validateGraphReferences(
  nodes: unknown[],
  edges: unknown[],
  path: string,
  diagnostics: TransactionDiagnostic[],
): void {
  const nodesById = new Map<string, GraphNodeIndex>();
  const seenNodeIds = new Set<string>();

  nodes.forEach((node, index) => {
    if (
      !isRecord(node) ||
      typeof node.id !== 'string' ||
      !isOneOf(node.kind, NODE_KINDS) ||
      !isDenseArray(node.ports)
    ) {
      return;
    }

    if (seenNodeIds.has(node.id)) {
      diagnostics.push(
        errorDiagnostic(
          'graph.node.duplicate',
          `PTB graph node id ${node.id} is duplicated.`,
          `${path}.nodes[${index}].id`,
        ),
      );
      return;
    }
    seenNodeIds.add(node.id);

    const ports = new Map<string, Port>();
    const seenPortIds = new Set<string>();
    node.ports.forEach((port, portIndex) => {
      if (
        !isRecord(port) ||
        typeof port.id !== 'string' ||
        !isOneOf(port.direction, PORT_DIRECTIONS) ||
        !isOneOf(port.role, PORT_ROLES)
      ) {
        return;
      }

      if (seenPortIds.has(port.id)) {
        diagnostics.push(
          errorDiagnostic(
            'graph.port.duplicate',
            `PTB graph port id ${port.id} is duplicated on node ${node.id}.`,
            `${path}.nodes[${index}].ports[${portIndex}].id`,
          ),
        );
        return;
      }
      seenPortIds.add(port.id);
      ports.set(port.id, {
        id: port.id,
        direction: port.direction,
        role: port.role,
      });
    });

    nodesById.set(node.id, { kind: node.kind, ports });
  });

  const seenEdgeIds = new Set<string>();
  const ioTargets = new Set<string>();
  const flowSources = new Set<string>();
  const flowTargets = new Set<string>();

  edges.forEach((edge, index) => {
    if (
      !isRecord(edge) ||
      typeof edge.id !== 'string' ||
      typeof edge.source !== 'string' ||
      typeof edge.sourceHandle !== 'string' ||
      typeof edge.target !== 'string' ||
      typeof edge.targetHandle !== 'string'
    ) {
      return;
    }

    if (seenEdgeIds.has(edge.id)) {
      diagnostics.push(
        errorDiagnostic(
          'graph.edge.duplicate',
          `PTB graph edge id ${edge.id} is duplicated.`,
          `${path}.edges[${index}].id`,
        ),
      );
    }
    seenEdgeIds.add(edge.id);

    const source = validateEdgeEndpoint(
      nodesById,
      edge.source,
      edge.sourceHandle,
      'source',
      `${path}.edges[${index}].source`,
      diagnostics,
    );
    const target = validateEdgeEndpoint(
      nodesById,
      edge.target,
      edge.targetHandle,
      'target',
      `${path}.edges[${index}].target`,
      diagnostics,
    );

    if (!isOneOf(edge.kind, EDGE_KINDS)) return;
    validateEdgePortSemantics(edge, source, target, index, path, diagnostics);

    if (edge.kind === 'io') {
      const key = `${edge.target}:${edge.targetHandle}`;
      if (ioTargets.has(key)) {
        diagnostics.push(
          errorDiagnostic(
            'graph.edge.duplicateTarget',
            `PTB graph IO target ${key} has more than one incoming edge.`,
            `${path}.edges[${index}].targetHandle`,
          ),
        );
      }
      ioTargets.add(key);
    }

    if (edge.kind === 'flow') {
      const sourceKey = edge.source;
      const targetKey = edge.target;
      if (flowSources.has(sourceKey)) {
        diagnostics.push(
          errorDiagnostic(
            'graph.edge.duplicateFlowSource',
            `PTB graph flow source node ${sourceKey} has more than one outgoing edge.`,
            `${path}.edges[${index}].source`,
          ),
        );
      }
      if (flowTargets.has(targetKey)) {
        diagnostics.push(
          errorDiagnostic(
            'graph.edge.duplicateFlowTarget',
            `PTB graph flow target node ${targetKey} has more than one incoming edge.`,
            `${path}.edges[${index}].target`,
          ),
        );
      }
      flowSources.add(sourceKey);
      flowTargets.add(targetKey);
    }
  });

  validateFlowTopology(nodes, edges, path, diagnostics);
}

function validateEdgeEndpoint(
  nodesById: Map<string, GraphNodeIndex>,
  nodeId: string,
  handleId: string,
  endpoint: 'source' | 'target',
  path: string,
  diagnostics: TransactionDiagnostic[],
): { node: GraphNodeIndex; port: Port } | undefined {
  const node = nodesById.get(nodeId);
  if (!node) {
    diagnostics.push(
      errorDiagnostic(
        'graph.edge.node',
        `PTB graph edge references missing node ${nodeId}.`,
        path,
      ),
    );
    return undefined;
  }

  const port = node.ports.get(handleId);
  if (!port) {
    diagnostics.push(
      errorDiagnostic(
        'graph.edge.handle',
        `PTB graph edge references missing handle ${handleId} on node ${nodeId}.`,
        path,
      ),
    );
    return undefined;
  }

  const expectedDirection: PortDirection = endpoint === 'source' ? 'out' : 'in';
  if (port.direction !== expectedDirection) {
    diagnostics.push(
      errorDiagnostic(
        'graph.edge.direction',
        `PTB graph edge ${endpoint} handle ${handleId} on node ${nodeId} must be an ${expectedDirection} port.`,
        path,
      ),
    );
  }

  return { node, port };
}

function validateEdgePortSemantics(
  edge: Record<string, unknown>,
  source: { node: GraphNodeIndex; port: Port } | undefined,
  target: { node: GraphNodeIndex; port: Port } | undefined,
  index: number,
  path: string,
  diagnostics: TransactionDiagnostic[],
): void {
  const sourcePath = `${path}.edges[${index}].source`;
  const targetPath = `${path}.edges[${index}].target`;

  if (source && source.port.role !== edge.kind) {
    diagnostics.push(
      errorDiagnostic(
        'graph.edge.role',
        `PTB graph edge source handle must be a ${edge.kind} port.`,
        sourcePath,
      ),
    );
  }
  if (target && target.port.role !== edge.kind) {
    diagnostics.push(
      errorDiagnostic(
        'graph.edge.role',
        `PTB graph edge target handle must be a ${edge.kind} port.`,
        targetPath,
      ),
    );
  }

  if (edge.kind === 'flow') {
    if (
      source &&
      source.node.kind !== 'Start' &&
      source.node.kind !== 'Command'
    ) {
      diagnostics.push(
        errorDiagnostic(
          'graph.edge.flow',
          'PTB graph flow edges must start at Start or Command nodes.',
          sourcePath,
        ),
      );
    }
    if (
      target &&
      target.node.kind !== 'Command' &&
      target.node.kind !== 'End'
    ) {
      diagnostics.push(
        errorDiagnostic(
          'graph.edge.flow',
          'PTB graph flow edges must target Command or End nodes.',
          targetPath,
        ),
      );
    }
  }

  if (edge.kind === 'io') {
    if (
      source &&
      source.node.kind !== 'Variable' &&
      source.node.kind !== 'Command'
    ) {
      diagnostics.push(
        errorDiagnostic(
          'graph.edge.io',
          'PTB graph IO edges must start at Variable or Command nodes.',
          sourcePath,
        ),
      );
    }
    if (target && target.node.kind !== 'Command') {
      diagnostics.push(
        errorDiagnostic(
          'graph.edge.io',
          'PTB graph IO edges must target Command nodes.',
          targetPath,
        ),
      );
    }
  }
}

function validateOptionalPosition(
  value: unknown,
  path: string,
  diagnostics: TransactionDiagnostic[],
): void {
  if (value === undefined) return;
  if (isRecord(value)) {
    validateUnknownFields(
      value,
      POSITION_KEYS,
      'graph.node.position.unknownField',
      path,
      'PTB graph node position',
      diagnostics,
    );
    if (isFiniteNumber(value.x) && isFiniteNumber(value.y)) {
      return;
    }
  }
  diagnostics.push(
    errorDiagnostic(
      'graph.node.position',
      'PTB graph node position must contain finite numeric x and y when present.',
      path,
    ),
  );
}

function validateCommandParams(
  value: unknown,
  commandKind: CommandKind | undefined,
  path: string,
  diagnostics: TransactionDiagnostic[],
): void {
  if (value === undefined) {
    if (commandKind === 'unsupported') {
      diagnostics.push(
        errorDiagnostic(
          'graph.command.params.runtime.sourceKind',
          'PTB graph Unsupported command runtime sourceKind must be a string.',
          `${path}.runtime.sourceKind`,
        ),
      );
    }
    return;
  }
  if (!isRecord(value)) {
    diagnostics.push(
      errorDiagnostic(
        'graph.command.params',
        'PTB graph command params must be an object when present.',
        path,
      ),
    );
    return;
  }

  validateUnknownFields(
    value,
    COMMAND_PARAM_KEYS,
    'graph.command.params.unknownField',
    path,
    'PTB graph command params',
    diagnostics,
  );
  validateCommandRuntimeParams(
    value.runtime,
    commandKind,
    `${path}.runtime`,
    diagnostics,
  );
  validateCommandUIParams(value.ui, `${path}.ui`, diagnostics);
}

function validateCommandRuntimeParams(
  value: unknown,
  commandKind: CommandKind | undefined,
  path: string,
  diagnostics: TransactionDiagnostic[],
): void {
  if (value === undefined) {
    if (commandKind === 'unsupported') {
      diagnostics.push(
        errorDiagnostic(
          'graph.command.params.runtime.sourceKind',
          'PTB graph Unsupported command runtime sourceKind must be a string.',
          `${path}.sourceKind`,
        ),
      );
    }
    return;
  }
  if (!isRecord(value)) {
    diagnostics.push(
      errorDiagnostic(
        'graph.command.params.runtime',
        'PTB graph command runtime params must be an object when present.',
        path,
      ),
    );
    return;
  }
  if (commandKind === undefined) return;

  validateUnknownFields(
    value,
    COMMAND_RUNTIME_KEYS_BY_KIND[commandKind],
    'graph.command.params.runtime.unknownField',
    path,
    `PTB graph ${commandKind} runtime params`,
    diagnostics,
  );

  switch (commandKind) {
    case 'moveCall':
      validateOptionalStringField(
        value.target,
        `${path}.target`,
        'graph.command.params.runtime.field',
        'PTB graph MoveCall runtime target must be a string when present.',
        diagnostics,
      );
      validateOptionalStringArrayField(
        value.typeArguments,
        `${path}.typeArguments`,
        'graph.command.params.runtime.typeArguments',
        'PTB graph MoveCall runtime typeArguments must be a dense string array when present.',
        diagnostics,
      );
      return;
    case 'makeMoveVec':
      if (
        value.type !== undefined &&
        value.type !== NULL_VALUE &&
        typeof value.type !== 'string'
      ) {
        diagnostics.push(
          errorDiagnostic(
            'graph.command.params.runtime.type',
            'PTB graph MakeMoveVec runtime type must be a string or null when present.',
            `${path}.type`,
          ),
        );
      }
      return;
    case 'publish':
      validateOptionalDenseArrayField(
        value.modules,
        `${path}.modules`,
        'graph.command.params.runtime.array',
        'PTB graph Publish runtime modules must be a dense array when present.',
        diagnostics,
      );
      validateOptionalDenseArrayField(
        value.dependencies,
        `${path}.dependencies`,
        'graph.command.params.runtime.array',
        'PTB graph Publish runtime dependencies must be a dense array when present.',
        diagnostics,
      );
      return;
    case 'upgrade':
      validateOptionalDenseArrayField(
        value.modules,
        `${path}.modules`,
        'graph.command.params.runtime.array',
        'PTB graph Upgrade runtime modules must be a dense array when present.',
        diagnostics,
      );
      validateOptionalDenseArrayField(
        value.dependencies,
        `${path}.dependencies`,
        'graph.command.params.runtime.array',
        'PTB graph Upgrade runtime dependencies must be a dense array when present.',
        diagnostics,
      );
      validateOptionalStringField(
        value.package,
        `${path}.package`,
        'graph.command.params.runtime.field',
        'PTB graph Upgrade runtime package must be a string when present.',
        diagnostics,
      );
      return;
    case 'unsupported':
      if (typeof value.sourceKind !== 'string') {
        diagnostics.push(
          errorDiagnostic(
            'graph.command.params.runtime.sourceKind',
            'PTB graph Unsupported command runtime sourceKind must be a string.',
            `${path}.sourceKind`,
          ),
        );
      }
      return;
    case 'splitCoins':
    case 'mergeCoins':
    case 'transferObjects':
      return;
  }
}

function validateCommandUIParams(
  value: unknown,
  path: string,
  diagnostics: TransactionDiagnostic[],
): void {
  if (value === undefined) return;
  if (!isRecord(value)) {
    diagnostics.push(
      errorDiagnostic(
        'graph.command.params.ui',
        'PTB graph command UI params must be an object when present.',
        path,
      ),
    );
    return;
  }

  validateUnknownFields(
    value,
    COMMAND_UI_KEYS,
    'graph.command.params.ui.unknownField',
    path,
    'PTB graph command UI params',
    diagnostics,
  );
  COMMAND_UI_COUNT_KEYS.forEach((key) => {
    validateOptionalNonNegativeIntegerField(
      value[key],
      `${path}.${key}`,
      'graph.command.params.ui.count',
      `PTB graph command UI param ${key} must be a non-negative integer when present.`,
      diagnostics,
    );
  });
  if (
    value.policyWidth !== undefined &&
    !isOneOf(value.policyWidth, NUMERIC_WIDTHS)
  ) {
    diagnostics.push(
      errorDiagnostic(
        'graph.command.params.ui.policyWidth',
        'PTB graph command UI policyWidth must be a supported numeric width when present.',
        `${path}.policyWidth`,
      ),
    );
  }
  if (value.readOnly !== undefined && typeof value.readOnly !== 'boolean') {
    diagnostics.push(
      errorDiagnostic(
        'graph.command.params.ui.readOnly',
        'PTB graph command UI readOnly must be a boolean when present.',
        `${path}.readOnly`,
      ),
    );
  }
}

function validateEdgeCast(
  value: unknown,
  path: string,
  diagnostics: TransactionDiagnostic[],
): void {
  if (value === undefined) return;
  if (!isRecord(value)) {
    diagnostics.push(
      errorDiagnostic(
        'graph.edge.cast',
        'PTB graph edge cast must contain a supported numeric width.',
        path,
      ),
    );
    return;
  }
  validateUnknownFields(
    value,
    EDGE_CAST_KEYS,
    'graph.edge.cast.unknownField',
    path,
    'PTB graph edge cast',
    diagnostics,
  );
  if (!isOneOf(value.to, NUMERIC_WIDTHS)) {
    diagnostics.push(
      errorDiagnostic(
        'graph.edge.cast',
        'PTB graph edge cast must contain a supported numeric width.',
        `${path}.to`,
      ),
    );
  }
}

function validateOptionalStringField(
  value: unknown,
  path: string,
  code: string,
  message: string,
  diagnostics: TransactionDiagnostic[],
): void {
  if (value === undefined || typeof value === 'string') return;
  diagnostics.push(errorDiagnostic(code, message, path));
}

function validateOptionalStringArrayField(
  value: unknown,
  path: string,
  code: string,
  message: string,
  diagnostics: TransactionDiagnostic[],
): void {
  if (value === undefined) return;
  if (isDenseArray(value) && value.every((item) => typeof item === 'string')) {
    return;
  }
  diagnostics.push(errorDiagnostic(code, message, path));
}

function validateOptionalDenseArrayField(
  value: unknown,
  path: string,
  code: string,
  message: string,
  diagnostics: TransactionDiagnostic[],
): void {
  if (value === undefined || isDenseArray(value)) return;
  diagnostics.push(errorDiagnostic(code, message, path));
}

function validateOptionalNonNegativeIntegerField(
  value: unknown,
  path: string,
  code: string,
  message: string,
  diagnostics: TransactionDiagnostic[],
): void {
  if (value === undefined) return;
  if (typeof value === 'number' && Number.isInteger(value) && value >= 0) {
    return;
  }
  diagnostics.push(errorDiagnostic(code, message, path));
}

function validateUnknownFields(
  value: Record<string, unknown>,
  allowedKeys: readonly string[],
  code: string,
  path: string,
  label: string,
  diagnostics: TransactionDiagnostic[],
): void {
  Object.keys(value)
    .filter((key) => !allowedKeys.includes(key))
    .forEach((key) => {
      diagnostics.push(
        errorDiagnostic(
          code,
          `${label} does not support field ${key}.`,
          `${path}.${key}`,
        ),
      );
    });
}

function validateVariableSemantic(
  value: unknown,
  path: string,
  diagnostics: TransactionDiagnostic[],
): void {
  if (value === undefined) return;

  if (!isRecord(value) || typeof value.kind !== 'string') {
    diagnostics.push(
      errorDiagnostic(
        'graph.variable.semantic',
        'PTB graph variable semantic must be an object with a kind.',
        path,
      ),
    );
    return;
  }

  if (value.kind === 'GasCoin') {
    validateUnknownFields(
      value,
      GAS_COIN_SEMANTIC_KEYS,
      'graph.variable.semantic.unknownField',
      path,
      'PTB graph GasCoin semantic',
      diagnostics,
    );
    return;
  }

  if (value.kind === 'UnsupportedInput') {
    validateUnknownFields(
      value,
      UNSUPPORTED_INPUT_SEMANTIC_KEYS,
      'graph.variable.semantic.unknownField',
      path,
      'PTB graph UnsupportedInput semantic',
      diagnostics,
    );
    if (typeof value.sourceKind !== 'string') {
      diagnostics.push(
        errorDiagnostic(
          'graph.variable.semantic.sourceKind',
          'UnsupportedInput semantic requires a sourceKind string.',
          `${path}.sourceKind`,
        ),
      );
    }
    return;
  }

  diagnostics.push(
    errorDiagnostic(
      'graph.variable.semantic.kind',
      `Unsupported variable semantic kind ${value.kind}.`,
      `${path}.kind`,
    ),
  );
}

function validatePTBTypeShape(
  value: unknown,
  path: string,
  diagnostics: TransactionDiagnostic[],
  seen: WeakSet<object>,
): void {
  if (!isRecord(value) || typeof value.kind !== 'string') {
    diagnostics.push(
      errorDiagnostic(
        'graph.type',
        'PTB graph type must be an object with a kind.',
        path,
      ),
    );
    return;
  }

  if (seen.has(value)) {
    diagnostics.push(
      errorDiagnostic(
        'graph.type.cycle',
        'PTB graph type must not contain cyclic references.',
        path,
      ),
    );
    return;
  }
  seen.add(value);

  if (!isOneOf(value.kind, TYPE_KINDS)) {
    diagnostics.push(
      errorDiagnostic(
        'graph.type.kind',
        `Unsupported PTB graph type kind ${value.kind}.`,
        `${path}.kind`,
      ),
    );
    seen.delete(value);
    return;
  }

  switch (value.kind) {
    case 'scalar':
      validateTypeUnknownFields(value, path, diagnostics);
      if (!isOneOf(value.name, SCALARS)) {
        diagnostics.push(
          errorDiagnostic(
            'graph.type.scalar',
            'Scalar PTB graph type requires a supported name.',
            `${path}.name`,
          ),
        );
      }
      seen.delete(value);
      return;
    case 'move_numeric':
      validateTypeUnknownFields(value, path, diagnostics);
      if (!isOneOf(value.width, NUMERIC_WIDTHS)) {
        diagnostics.push(
          errorDiagnostic(
            'graph.type.numeric',
            'Move numeric PTB graph type requires a supported width.',
            `${path}.width`,
          ),
        );
      }
      seen.delete(value);
      return;
    case 'vector':
    case 'option':
      validateTypeUnknownFields(value, path, diagnostics);
      validatePTBTypeShape(value.elem, `${path}.elem`, diagnostics, seen);
      seen.delete(value);
      return;
    case 'tuple':
      validateTypeUnknownFields(value, path, diagnostics);
      if (!isDenseArray(value.elems)) {
        diagnostics.push(
          errorDiagnostic(
            'graph.type.tuple',
            'Tuple PTB graph type requires elems array.',
            `${path}.elems`,
          ),
        );
        seen.delete(value);
        return;
      }
      value.elems.forEach((elem, index) => {
        validatePTBTypeShape(
          elem,
          `${path}.elems[${index}]`,
          diagnostics,
          seen,
        );
      });
      seen.delete(value);
      return;
    case 'object':
      validateTypeUnknownFields(value, path, diagnostics);
      if (value.typeTag !== undefined && typeof value.typeTag !== 'string') {
        diagnostics.push(
          errorDiagnostic(
            'graph.type.object',
            'Object PTB graph type typeTag must be a string when present.',
            `${path}.typeTag`,
          ),
        );
      }
      seen.delete(value);
      return;
    case 'unknown':
      validateTypeUnknownFields(value, path, diagnostics);
      if (
        value.debugInfo !== undefined &&
        typeof value.debugInfo !== 'string'
      ) {
        diagnostics.push(
          errorDiagnostic(
            'graph.type.unknown',
            'Unknown PTB graph type debugInfo must be a string when present.',
            `${path}.debugInfo`,
          ),
        );
      }
      seen.delete(value);
      return;
  }
}

function nodeKeysForKind(kind: PTBNode['kind']): readonly string[] {
  switch (kind) {
    case 'Start':
      return START_NODE_KEYS;
    case 'End':
      return END_NODE_KEYS;
    case 'Command':
      return COMMAND_NODE_KEYS;
    case 'Variable':
      return VARIABLE_NODE_KEYS;
  }
}

function validateTypeUnknownFields(
  value: Record<string, unknown>,
  path: string,
  diagnostics: TransactionDiagnostic[],
): void {
  if (!isOneOf(value.kind, TYPE_KINDS)) return;
  validateUnknownFields(
    value,
    TYPE_KEYS_BY_KIND[value.kind],
    'graph.type.unknownField',
    path,
    'PTB graph type',
    diagnostics,
  );
}

function isOneOf<const T extends readonly string[]>(
  value: unknown,
  values: T,
): value is T[number] {
  return typeof value === 'string' && values.includes(value);
}
