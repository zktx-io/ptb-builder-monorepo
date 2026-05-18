import {
  indexedInputHandle,
  indexedInputHandleIndex,
  inputHandle,
  isInputHandle,
  isUnknownResultOutputHandle,
  nestedResultHandleIndex,
  RESULT_HANDLE_ID,
} from './handles.js';
import { normalizeGraphRawInput } from './rawInput.js';
import { errorDiagnostic, freezeDiagnostics } from '../ir/diagnostics.js';
import type { TransactionDiagnostic } from '../ir/diagnostics.js';
import { isNonNegativeSafeInteger, MAX_RESULT_COUNT } from '../ir/limits.js';
import type { RawCallArg } from '../raw/types.js';
import {
  parseBase64Bytes,
  parseMoveIdentifier,
  parseMoveTypeTag,
  parseObjectId,
} from '../raw/types.js';
import {
  findNonPlainData,
  isDenseArray,
  isFiniteNumber,
  isPlainObject,
  MAX_PTB_TYPE_DEPTH,
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
}

export interface CommandRuntimeParams {
  target?: string;
  typeArguments?: string[];
  resultCount?: number;
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
const PORT_ID_PATTERN = /^[A-Za-z][A-Za-z0-9_]*$/;
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
  moveCall: ['target', 'typeArguments', 'resultCount'],
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
] as const;
const COMMAND_UI_KEYS = [...COMMAND_UI_COUNT_KEYS] as const;
interface GraphNodeIndex {
  id: string;
  kind: PTBNode['kind'];
  ports: Map<string, Port>;
  ioInputPortIds: Set<string>;
  ioOutputPorts: Array<{ id: string; path: string }>;
  path: string;
  command?: CommandKind;
  runtime?: Record<string, unknown>;
}

export function validatePTBGraph(
  value: unknown,
  path = '$',
): readonly TransactionDiagnostic[] {
  const diagnostics: TransactionDiagnostic[] = [];

  if (!isPlainObject(value)) {
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
  if (!isPlainObject(value)) {
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
  validateCommandInputPorts(value, commandKind, path, diagnostics);
}

type CommandInputPortMatch =
  | { kind: 'single' }
  | { kind: 'indexed'; group: string; index: number };

function validateCommandInputPorts(
  value: Record<string, unknown>,
  commandKind: CommandKind | undefined,
  path: string,
  diagnostics: TransactionDiagnostic[],
): void {
  if (commandKind === undefined) return;
  if (!isDenseArray(value.ports)) return;

  const indexedGroups = new Map<
    string,
    Array<{ index: number; portIndex: number; portId: string }>
  >();

  value.ports.forEach((port, portIndex) => {
    if (
      !isPlainObject(port) ||
      port.direction !== 'in' ||
      port.role !== 'io' ||
      typeof port.id !== 'string'
    ) {
      return;
    }

    const match = commandInputPortMatch(commandKind, port.id);
    if (match === undefined) {
      diagnostics.push(
        errorDiagnostic(
          'graph.command.inputPort.invalid',
          `PTB graph ${commandKind} command declares non-canonical IO input port ${port.id}. Use the command-specific model input handles only.`,
          `${path}.ports[${portIndex}].id`,
        ),
      );
      return;
    }

    if (match.kind === 'indexed') {
      const group = indexedGroups.get(match.group) ?? [];
      group.push({ index: match.index, portIndex, portId: port.id });
      indexedGroups.set(match.group, group);
    }
  });

  indexedGroups.forEach((ports) => {
    const sorted = [...ports].sort((left, right) => left.index - right.index);
    const seenIndexes = new Set<number>();
    let expectedIndex = 0;
    sorted.forEach((port) => {
      if (seenIndexes.has(port.index)) return;
      seenIndexes.add(port.index);
      if (port.index === expectedIndex) {
        expectedIndex += 1;
        return;
      }
      diagnostics.push(
        errorDiagnostic(
          'graph.command.inputPort.invalid',
          `PTB graph ${commandKind} command declares sparse IO input port ${port.portId}. Indexed model input handles must be dense from zero.`,
          `${path}.ports[${port.portIndex}].id`,
        ),
      );
      expectedIndex = port.index + 1;
    });
  });
}

function commandInputPortMatch(
  commandKind: CommandKind,
  portId: string,
): CommandInputPortMatch | undefined {
  switch (commandKind) {
    case 'splitCoins':
      return (
        singleInputPortMatch(portId, 'coin') ??
        indexedInputPortMatch(portId, 'amount')
      );
    case 'mergeCoins':
      return (
        singleInputPortMatch(portId, 'destination') ??
        indexedInputPortMatch(portId, 'source')
      );
    case 'transferObjects':
      return (
        singleInputPortMatch(portId, 'recipient') ??
        indexedInputPortMatch(portId, 'object')
      );
    case 'makeMoveVec':
      return indexedInputPortMatch(portId, 'elem');
    case 'moveCall':
      return indexedInputPortMatch(portId, 'arg');
    case 'upgrade':
      return singleInputPortMatch(portId, 'upgradeCap');
    case 'publish':
    case 'unsupported':
      return undefined;
  }
}

function singleInputPortMatch(
  portId: string,
  name: string,
): CommandInputPortMatch | undefined {
  return isInputHandle(portId, name) ? { kind: 'single' } : undefined;
}

function indexedInputPortMatch(
  portId: string,
  name: string,
): CommandInputPortMatch | undefined {
  const index = indexedInputHandleIndex(portId, name);
  return index === undefined
    ? undefined
    : { kind: 'indexed', group: name, index };
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
  if (isPlainObject(value.varType) && value.varType.kind === 'option') {
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
  validatePlainDataField(
    value,
    'value',
    `${path}.value`,
    'PTB graph variable value',
    diagnostics,
  );
  validateVariableSemantic(value.semantic, `${path}.semantic`, diagnostics);
  const rawInput = normalizeGraphRawInput(
    value.rawInput,
    `${path}.rawInput`,
    diagnostics,
  );
  validateVariableRawInputValue(rawInput, value, path, diagnostics);
  validateVariableSourceCompatibility(rawInput, value, path, diagnostics);
}

function validateVariableRawInputValue(
  rawInput: RawCallArg | undefined,
  node: Record<string, unknown>,
  path: string,
  diagnostics: TransactionDiagnostic[],
): void {
  if (!rawInput) return;
  const hasValue = Object.prototype.hasOwnProperty.call(node, 'value');
  if (rawInput.kind === 'Pure') {
    if (!hasValue) return;
    diagnostics.push(
      errorDiagnostic(
        'graph.variable.rawInputValue',
        'PTB graph Pure rawInput must not also store a typed value.',
        `${path}.value`,
      ),
    );
    return;
  }
  if (!hasValue) return;

  const matches =
    rawInput.kind === 'Object'
      ? rawObjectValueMatches(rawInput.object, node.value)
      : rawFundsWithdrawalValueMatches(rawInput.value, node.value);
  if (matches) return;

  diagnostics.push(
    errorDiagnostic(
      'graph.variable.rawInputValue',
      'PTB graph variable value must match its canonical rawInput payload when both are present.',
      `${path}.value`,
    ),
  );
}

function rawObjectValueMatches(
  raw: Extract<RawCallArg, { kind: 'Object' }>['object'],
  value: unknown,
): boolean {
  if (!isPlainObject(value) || value.kind !== raw.kind) return false;
  switch (raw.kind) {
    case 'ImmOrOwnedObject':
    case 'Receiving':
      return (
        value.objectId === raw.objectId &&
        value.version === raw.version &&
        value.digest === raw.digest &&
        Object.keys(value).every((key) =>
          ['kind', 'objectId', 'version', 'digest'].includes(key),
        )
      );
    case 'SharedObject':
      return (
        value.objectId === raw.objectId &&
        value.initialSharedVersion === raw.initialSharedVersion &&
        value.mutable === raw.mutable &&
        Object.keys(value).every((key) =>
          ['kind', 'objectId', 'initialSharedVersion', 'mutable'].includes(key),
        )
      );
  }
}

function rawFundsWithdrawalValueMatches(
  raw: Extract<RawCallArg, { kind: 'FundsWithdrawal' }>['value'],
  value: unknown,
): boolean {
  if (!isPlainObject(value)) return false;
  const reservation = isPlainObject(value.reservation)
    ? value.reservation
    : undefined;
  const typeArg = isPlainObject(value.typeArg) ? value.typeArg : undefined;
  const withdrawFrom = isPlainObject(value.withdrawFrom)
    ? value.withdrawFrom
    : undefined;

  return (
    Object.keys(value).every((key) =>
      ['reservation', 'typeArg', 'withdrawFrom'].includes(key),
    ) &&
    reservation?.kind === raw.reservation.kind &&
    reservation.amount === raw.reservation.amount &&
    Object.keys(reservation).every((key) => ['kind', 'amount'].includes(key)) &&
    typeArg?.kind === raw.typeArg.kind &&
    typeArg.type === raw.typeArg.type &&
    Object.keys(typeArg).every((key) => ['kind', 'type'].includes(key)) &&
    withdrawFrom?.kind === raw.withdrawFrom.kind &&
    Object.keys(withdrawFrom).every((key) => key === 'kind')
  );
}

function validateVariableSourceCompatibility(
  rawInput: RawCallArg | undefined,
  node: Record<string, unknown>,
  path: string,
  diagnostics: TransactionDiagnostic[],
): void {
  const semantic = isPlainObject(node.semantic) ? node.semantic : undefined;
  const varType = isPlainObject(node.varType) ? node.varType : undefined;

  if (semantic?.kind === 'GasCoin') {
    if (rawInput !== undefined) {
      diagnostics.push(
        errorDiagnostic(
          'graph.variable.sourceConflict',
          'GasCoin semantic variables must not also contain rawInput.',
          `${path}.rawInput`,
        ),
      );
    }
    if (Object.prototype.hasOwnProperty.call(node, 'value')) {
      diagnostics.push(
        errorDiagnostic(
          'graph.variable.sourceConflict',
          'GasCoin semantic variables must not also contain a value.',
          `${path}.value`,
        ),
      );
    }
    return;
  }

  if (semantic?.kind === 'UnsupportedInput' && rawInput !== undefined) {
    diagnostics.push(
      errorDiagnostic(
        'graph.variable.sourceConflict',
        'UnsupportedInput semantic variables must not also contain rawInput.',
        `${path}.rawInput`,
      ),
    );
    return;
  }

  if (!rawInput) return;
  if (rawInput.kind === 'Pure') {
    if (!isPureGraphType(varType)) {
      diagnostics.push(
        errorDiagnostic(
          'graph.variable.rawInputType',
          'Pure rawInput requires a pure-compatible or unknown variable type.',
          `${path}.varType`,
        ),
      );
    }
    return;
  }
  if (rawInput.kind === 'Object') {
    if (varType?.kind !== 'object') {
      diagnostics.push(
        errorDiagnostic(
          'graph.variable.rawInputType',
          'Object rawInput requires an object variable type.',
          `${path}.varType`,
        ),
      );
    }
    return;
  }
  if (varType?.kind !== 'unknown') {
    diagnostics.push(
      errorDiagnostic(
        'graph.variable.rawInputType',
        'FundsWithdrawal rawInput requires an unknown variable type.',
        `${path}.varType`,
      ),
    );
  }
}

function isPureGraphType(type: Record<string, unknown> | undefined): boolean {
  if (!type || typeof type.kind !== 'string') return false;
  switch (type.kind) {
    case 'unknown':
    case 'move_numeric':
      return true;
    case 'scalar':
      return type.name !== 'number';
    case 'vector':
    case 'option':
      return isPlainObject(type.elem) && isPureGraphType(type.elem);
    case 'object':
    case 'tuple':
      return false;
    default:
      return false;
  }
}

function validatePort(
  value: unknown,
  path: string,
  diagnostics: TransactionDiagnostic[],
): void {
  if (!isPlainObject(value)) {
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
  } else if (!PORT_ID_PATTERN.test(value.id)) {
    diagnostics.push(
      errorDiagnostic(
        'graph.port.id',
        'PTB graph port id must start with an ASCII letter and contain only ASCII letters, digits, and underscores.',
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
  if (!isPlainObject(value)) {
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
      isPlainObject(node) &&
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
    edges.some((edge) => isPlainObject(edge) && edge.kind === 'flow');

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
      isPlainObject(edge) &&
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
  const seenInputNames = new Set<string>();

  nodes.forEach((node, index) => {
    if (
      !isPlainObject(node) ||
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

    if (
      node.kind === 'Variable' &&
      typeof node.name === 'string' &&
      node.name.length > 0 &&
      !isGasSemantic(node.semantic)
    ) {
      if (seenInputNames.has(node.name)) {
        diagnostics.push(
          errorDiagnostic(
            'graph.variable.duplicateName',
            `PTB graph variable name ${node.name} is duplicated and would produce a duplicate TransactionIR input id.`,
            `${path}.nodes[${index}].name`,
          ),
        );
      }
      seenInputNames.add(node.name);
    }

    const ports = new Map<string, Port>();
    const ioInputPortIds = new Set<string>();
    const ioOutputPorts: Array<{ id: string; path: string }> = [];
    const seenPortIds = new Set<string>();
    node.ports.forEach((port, portIndex) => {
      if (
        !isPlainObject(port) ||
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
      if (port.role === 'io' && port.direction === 'in') {
        ioInputPortIds.add(port.id);
      }
      if (port.role === 'io' && port.direction === 'out') {
        ioOutputPorts.push({
          id: port.id,
          path: `${path}.nodes[${index}].ports[${portIndex}].id`,
        });
      }
    });

    nodesById.set(node.id, {
      id: node.id,
      kind: node.kind,
      ports,
      ioInputPortIds,
      ioOutputPorts,
      path: `${path}.nodes[${index}]`,
      ...(node.kind === 'Command' && isOneOf(node.command, COMMAND_KINDS)
        ? {
            command: node.command,
            runtime: commandRuntimeParams(node),
          }
        : {}),
    });
  });

  const seenEdgeIds = new Set<string>();
  const ioTargets = new Set<string>();
  const flowSources = new Set<string>();
  const flowTargets = new Set<string>();
  const validIoIncomingHandlesByCommand = new Map<string, Set<string>>();
  const validIoOutgoingHandlesByCommand = new Map<string, Set<string>>();
  const invalidInputCommands = new Set<string>();
  const invalidOutputCommands = new Set<string>();

  edges.forEach((edge, index) => {
    if (
      !isPlainObject(edge) ||
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
      const targetCommand = nodesById.get(edge.target)?.command;
      const sourceCommand = nodesById.get(edge.source)?.command;
      const sourceValid = isValidIoSourceEndpoint(source);
      const targetValid = isValidIoTargetEndpoint(target);
      if (sourceCommand !== undefined && !sourceValid) {
        invalidOutputCommands.add(edge.source);
      }
      if (targetCommand !== undefined && !targetValid) {
        invalidInputCommands.add(edge.target);
      }
      if (ioTargets.has(key)) {
        diagnostics.push(
          errorDiagnostic(
            'graph.edge.duplicateTarget',
            `PTB graph IO target ${key} has more than one incoming edge.`,
            `${path}.edges[${index}].targetHandle`,
          ),
        );
        if (targetCommand !== undefined) invalidInputCommands.add(edge.target);
      } else if (sourceValid && targetValid) {
        if (targetCommand !== undefined) {
          addHandleToMap(
            validIoIncomingHandlesByCommand,
            edge.target,
            edge.targetHandle,
          );
        }
        if (sourceCommand !== undefined) {
          addHandleToMap(
            validIoOutgoingHandlesByCommand,
            edge.source,
            edge.sourceHandle,
          );
        }
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

  validateCommandSemanticEdges(
    nodesById,
    validIoIncomingHandlesByCommand,
    validIoOutgoingHandlesByCommand,
    invalidInputCommands,
    invalidOutputCommands,
    diagnostics,
  );
  validateFlowTopology(nodes, edges, path, diagnostics);
}

function addHandleToMap(
  map: Map<string, Set<string>>,
  nodeId: string,
  handleId: string,
): void {
  const handles = map.get(nodeId) ?? new Set<string>();
  handles.add(handleId);
  map.set(nodeId, handles);
}

function isValidIoSourceEndpoint(
  endpoint: { node: GraphNodeIndex; port: Port } | undefined,
): boolean {
  return (
    endpoint !== undefined &&
    endpoint.port.direction === 'out' &&
    endpoint.port.role === 'io' &&
    (endpoint.node.kind === 'Variable' || endpoint.node.kind === 'Command')
  );
}

function isValidIoTargetEndpoint(
  endpoint: { node: GraphNodeIndex; port: Port } | undefined,
): boolean {
  return (
    endpoint !== undefined &&
    endpoint.port.direction === 'in' &&
    endpoint.port.role === 'io' &&
    endpoint.node.kind === 'Command'
  );
}

function validateCommandSemanticEdges(
  nodesById: Map<string, GraphNodeIndex>,
  incomingHandlesByCommand: Map<string, Set<string>>,
  outgoingHandlesByCommand: Map<string, Set<string>>,
  invalidInputCommands: Set<string>,
  invalidOutputCommands: Set<string>,
  diagnostics: TransactionDiagnostic[],
): void {
  nodesById.forEach((node) => {
    if (node.kind !== 'Command' || node.command === undefined) return;

    const incomingHandles =
      incomingHandlesByCommand.get(node.id) ?? new Set<string>();
    const outgoingHandles =
      outgoingHandlesByCommand.get(node.id) ?? new Set<string>();
    const hasInputPortShapeIssue = commandInputPortShapeIssue(node);

    if (!hasInputPortShapeIssue && !invalidInputCommands.has(node.id)) {
      validateRequiredCommandInputs(
        node,
        incomingHandles,
        invalidInputCommands,
        diagnostics,
      );
    }

    if (!invalidOutputCommands.has(node.id)) {
      validateDeclaredCommandOutputs(
        node,
        incomingHandles,
        outgoingHandles,
        invalidInputCommands,
        diagnostics,
      );
    }
  });
}

function commandInputPortShapeIssue(node: GraphNodeIndex): boolean {
  if (node.command === undefined) return false;

  for (const portId of node.ioInputPortIds) {
    if (commandInputPortMatch(node.command, portId) === undefined) return true;
  }
  return false;
}

function validateRequiredCommandInputs(
  node: GraphNodeIndex,
  incomingHandles: Set<string>,
  invalidInputCommands: Set<string>,
  diagnostics: TransactionDiagnostic[],
): void {
  if (node.command === undefined) return;

  const missing: string[] = [];
  switch (node.command) {
    case 'splitCoins':
      if (!incomingHandles.has(inputHandle('coin'))) {
        missing.push(inputHandle('coin'));
      }
      if (!hasIndexedIncomingHandle(incomingHandles, 'amount')) {
        missing.push(indexedInputHandle('amount', 0));
      }
      break;
    case 'mergeCoins':
      if (!incomingHandles.has(inputHandle('destination'))) {
        missing.push(inputHandle('destination'));
      }
      if (!hasIndexedIncomingHandle(incomingHandles, 'source')) {
        missing.push(indexedInputHandle('source', 0));
      }
      break;
    case 'transferObjects':
      if (!incomingHandles.has(inputHandle('recipient'))) {
        missing.push(inputHandle('recipient'));
      }
      if (!hasIndexedIncomingHandle(incomingHandles, 'object')) {
        missing.push(indexedInputHandle('object', 0));
      }
      break;
    case 'makeMoveVec':
      if (
        (node.runtime?.type === undefined ||
          node.runtime.type === NULL_VALUE) &&
        !hasIndexedIncomingHandle(incomingHandles, 'elem')
      ) {
        missing.push(indexedInputHandle('elem', 0));
      }
      break;
    case 'upgrade':
      if (!incomingHandles.has(inputHandle('upgradeCap'))) {
        missing.push(inputHandle('upgradeCap'));
      }
      break;
    case 'moveCall':
    case 'publish':
    case 'unsupported':
      break;
  }

  missing.forEach((handle) => {
    diagnostics.push(
      errorDiagnostic(
        'graph.command.inputMissing',
        `PTB graph ${node.command} command ${node.id} requires an IO edge into ${handle}.`,
        node.path,
      ),
    );
  });
  if (missing.length > 0) invalidInputCommands.add(node.id);
}

function hasIndexedIncomingHandle(
  incomingHandles: Set<string>,
  name: string,
): boolean {
  for (const handle of incomingHandles) {
    if (indexedInputHandleIndex(handle, name) !== undefined) return true;
  }
  return false;
}

function validateDeclaredCommandOutputs(
  node: GraphNodeIndex,
  incomingHandles: Set<string>,
  outgoingHandles: Set<string>,
  invalidInputCommands: Set<string>,
  diagnostics: TransactionDiagnostic[],
): void {
  if (node.command === undefined) return;

  node.ioOutputPorts.forEach((port) => {
    if (
      node.command === 'splitCoins' &&
      invalidInputCommands.has(node.id) &&
      isUnknownResultOutputHandle(port.id)
    ) {
      return;
    }
    if (
      isDeclaredCommandOutputAllowed(
        node,
        port.id,
        incomingHandles,
        outgoingHandles,
      )
    ) {
      return;
    }

    diagnostics.push(
      errorDiagnostic(
        'graph.command.outputPort.invalid',
        `PTB graph ${node.command} command declares non-canonical IO output port ${port.id}. Use model output handles such as out_result or out_N only when the command produces those results.`,
        port.path,
      ),
    );
  });
}

function isDeclaredCommandOutputAllowed(
  node: GraphNodeIndex,
  portId: string,
  incomingHandles: Set<string>,
  outgoingHandles: Set<string>,
): boolean {
  switch (node.command) {
    case 'transferObjects':
    case 'mergeCoins':
    case 'unsupported':
      return false;
    case 'publish':
    case 'makeMoveVec':
    case 'upgrade':
      return isSingleResultOutputAllowed(portId, outgoingHandles);
    case 'splitCoins':
      return isKnownResultOutputAllowed(
        portId,
        countIndexedIncomingHandles(incomingHandles, 'amount'),
        outgoingHandles,
      );
    case 'moveCall': {
      const resultCount = node.runtime?.resultCount;
      return isNonNegativeSafeInteger(resultCount) &&
        resultCount <= MAX_RESULT_COUNT
        ? isKnownResultOutputAllowed(portId, resultCount, outgoingHandles)
        : isUnknownResultOutputHandle(portId);
    }
    default:
      return false;
  }
}

function isSingleResultOutputAllowed(
  portId: string,
  outgoingHandles: Set<string>,
): boolean {
  return (
    portId === RESULT_HANDLE_ID ||
    (nestedResultHandleIndex(portId) === 0 && outgoingHandles.has(portId))
  );
}

function isKnownResultOutputAllowed(
  portId: string,
  resultCount: number,
  outgoingHandles: Set<string>,
): boolean {
  if (resultCount <= 0) return false;
  if (resultCount === 1)
    return isSingleResultOutputAllowed(portId, outgoingHandles);

  const index = nestedResultHandleIndex(portId);
  return index !== undefined && index < resultCount;
}

function countIndexedIncomingHandles(
  incomingHandles: Set<string>,
  name: string,
): number {
  let count = 0;
  incomingHandles.forEach((handle) => {
    if (indexedInputHandleIndex(handle, name) !== undefined) count += 1;
  });
  return count;
}

function commandRuntimeParams(
  node: Record<string, unknown>,
): Record<string, unknown> | undefined {
  if (!isPlainObject(node.params)) return undefined;
  return isPlainObject(node.params.runtime) ? node.params.runtime : undefined;
}

function isGasSemantic(value: unknown): boolean {
  return isPlainObject(value) && value.kind === 'GasCoin';
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
  if (isPlainObject(value)) {
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
  if (!isPlainObject(value)) {
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
  if (!isPlainObject(value)) {
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
      validateMoveCallTargetField(value.target, `${path}.target`, diagnostics);
      validateOptionalMoveTypeTagArrayField(
        value.typeArguments,
        `${path}.typeArguments`,
        'graph.command.params.runtime.typeArguments',
        'PTB graph MoveCall runtime typeArguments must be a dense array of valid Move type tags when present.',
        diagnostics,
      );
      validateOptionalResultCountField(
        value.resultCount,
        `${path}.resultCount`,
        diagnostics,
      );
      return;
    case 'makeMoveVec':
      if (
        value.type !== undefined &&
        value.type !== NULL_VALUE &&
        (typeof value.type !== 'string' ||
          parseMoveTypeTag(value.type) === undefined)
      ) {
        diagnostics.push(
          errorDiagnostic(
            'graph.command.params.runtime.type',
            'PTB graph MakeMoveVec runtime type must be a valid Move type tag or null when present.',
            `${path}.type`,
          ),
        );
      }
      return;
    case 'publish':
      validateOptionalNonEmptyBase64ArrayField(
        value.modules,
        `${path}.modules`,
        'graph.command.params.runtime.modules',
        'PTB graph Publish runtime modules must be a non-empty dense canonical base64 array when present.',
        diagnostics,
      );
      validateOptionalObjectIdArrayField(
        value.dependencies,
        `${path}.dependencies`,
        'graph.command.params.runtime.dependencies',
        'PTB graph Publish runtime dependencies must be a dense canonical object ID array when present.',
        diagnostics,
      );
      return;
    case 'upgrade':
      validateOptionalNonEmptyBase64ArrayField(
        value.modules,
        `${path}.modules`,
        'graph.command.params.runtime.modules',
        'PTB graph Upgrade runtime modules must be a non-empty dense canonical base64 array when present.',
        diagnostics,
      );
      validateOptionalObjectIdArrayField(
        value.dependencies,
        `${path}.dependencies`,
        'graph.command.params.runtime.dependencies',
        'PTB graph Upgrade runtime dependencies must be a dense canonical object ID array when present.',
        diagnostics,
      );
      validateOptionalObjectIdField(
        value.package,
        `${path}.package`,
        'graph.command.params.runtime.field',
        'PTB graph Upgrade runtime package must be a canonical object ID when present.',
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
      validatePlainDataField(
        value,
        'value',
        `${path}.value`,
        'PTB graph Unsupported command runtime value',
        diagnostics,
      );
      return;
    case 'splitCoins':
    case 'mergeCoins':
    case 'transferObjects':
      return;
  }
}

function validatePlainDataField(
  owner: Record<string, unknown>,
  key: string,
  path: string,
  label: string,
  diagnostics: TransactionDiagnostic[],
): void {
  if (!Object.prototype.hasOwnProperty.call(owner, key)) return;
  const issue = findNonPlainData(owner[key], path);
  if (!issue) return;

  diagnostics.push(
    errorDiagnostic(
      'graph.plainData',
      `${label} must contain only plain model-owned data. ${issue.message}`,
      issue.path,
    ),
  );
}

function validateCommandUIParams(
  value: unknown,
  path: string,
  diagnostics: TransactionDiagnostic[],
): void {
  if (value === undefined) return;
  if (!isPlainObject(value)) {
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
}

function validateEdgeCast(
  value: unknown,
  path: string,
  diagnostics: TransactionDiagnostic[],
): void {
  if (value === undefined) return;
  if (!isPlainObject(value)) {
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

function validateOptionalMoveTypeTagArrayField(
  value: unknown,
  path: string,
  code: string,
  message: string,
  diagnostics: TransactionDiagnostic[],
): void {
  if (value === undefined) return;
  if (
    isDenseArray(value) &&
    value.every((item) => parseMoveTypeTag(item) !== undefined)
  ) {
    return;
  }
  diagnostics.push(errorDiagnostic(code, message, path));
}

function validateOptionalNonEmptyBase64ArrayField(
  value: unknown,
  path: string,
  code: string,
  message: string,
  diagnostics: TransactionDiagnostic[],
): void {
  if (value === undefined) return;
  if (
    isDenseArray(value) &&
    value.length > 0 &&
    value.every(
      (item) => typeof item === 'string' && parseBase64Bytes(item) === item,
    )
  ) {
    return;
  }
  diagnostics.push(errorDiagnostic(code, message, path));
}

function validateOptionalObjectIdArrayField(
  value: unknown,
  path: string,
  code: string,
  message: string,
  diagnostics: TransactionDiagnostic[],
): void {
  if (value === undefined) return;
  if (
    isDenseArray(value) &&
    value.every(
      (item) => typeof item === 'string' && parseObjectId(item) === item,
    )
  ) {
    return;
  }
  diagnostics.push(errorDiagnostic(code, message, path));
}

function validateOptionalObjectIdField(
  value: unknown,
  path: string,
  code: string,
  message: string,
  diagnostics: TransactionDiagnostic[],
): void {
  if (value === undefined) return;
  if (typeof value === 'string' && parseObjectId(value) === value) return;
  diagnostics.push(errorDiagnostic(code, message, path));
}

function validateMoveCallTargetField(
  value: unknown,
  path: string,
  diagnostics: TransactionDiagnostic[],
): void {
  if (value === undefined) return;
  if (typeof value !== 'string') {
    diagnostics.push(
      errorDiagnostic(
        'graph.command.params.runtime.field',
        'PTB graph MoveCall runtime target must be a string when present.',
        path,
      ),
    );
    return;
  }

  const parts = value.split('::');
  if (
    parts.length === 3 &&
    parseObjectId(parts[0]) === parts[0] &&
    parseMoveIdentifier(parts[1]) === parts[1] &&
    parseMoveIdentifier(parts[2]) === parts[2]
  ) {
    return;
  }

  diagnostics.push(
    errorDiagnostic(
      'graph.command.params.runtime.target',
      'PTB graph MoveCall runtime target must be canonical package::module::function.',
      path,
    ),
  );
}

function validateOptionalResultCountField(
  value: unknown,
  path: string,
  diagnostics: TransactionDiagnostic[],
): void {
  if (value === undefined) return;
  if (isNonNegativeSafeInteger(value) && value <= MAX_RESULT_COUNT) return;
  diagnostics.push(
    errorDiagnostic(
      'graph.command.params.runtime.resultCount',
      `PTB graph MoveCall runtime resultCount must be a non-negative safe integer no greater than ${MAX_RESULT_COUNT} when present.`,
      path,
    ),
  );
}

function validateOptionalNonNegativeIntegerField(
  value: unknown,
  path: string,
  code: string,
  message: string,
  diagnostics: TransactionDiagnostic[],
): void {
  if (value === undefined) return;
  if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) {
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

  if (!isPlainObject(value) || typeof value.kind !== 'string') {
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
  depth = 0,
): void {
  if (depth > MAX_PTB_TYPE_DEPTH) {
    diagnostics.push(
      errorDiagnostic(
        'graph.type.depth',
        `PTB graph type nesting must not exceed ${MAX_PTB_TYPE_DEPTH}.`,
        path,
      ),
    );
    return;
  }

  if (!isPlainObject(value) || typeof value.kind !== 'string') {
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
      validatePTBTypeShape(
        value.elem,
        `${path}.elem`,
        diagnostics,
        seen,
        depth + 1,
      );
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
          depth + 1,
        );
      });
      seen.delete(value);
      return;
    case 'object':
      validateTypeUnknownFields(value, path, diagnostics);
      if (
        value.typeTag !== undefined &&
        (typeof value.typeTag !== 'string' ||
          parseMoveTypeTag(value.typeTag) === undefined)
      ) {
        diagnostics.push(
          errorDiagnostic(
            'graph.type.object',
            'Object PTB graph type typeTag must be a valid Move type tag when present.',
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
