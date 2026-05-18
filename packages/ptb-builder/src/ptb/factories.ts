// src/ptb/factories.ts

// -----------------------------------------------------------------------------
// Pure PTB node factories (domain-level, UI-agnostic).
// - Variable nodes: no flow ports (IO out only).
// - Command nodes: flow+IO ports are provided by the central registry.
// - ID generation may be supplied per factory call; module fallback is for
//   external direct factory use only, not React component ownership.
// - UI count defaults for commands are seeded automatically when absent,
//   so the initial port sets always reflect a usable default.
// - The model allows vector<object>/option<object>; UI-level creation disallows
//   them.
// -----------------------------------------------------------------------------

import { NULL_VALUE } from '@zktx.io/ptb-model';
import type { RawCallArg } from '@zktx.io/ptb-model';

import { M, O, Opt, S, V } from './graph/typeHelpers';
import type {
  CommandKind,
  CommandNode,
  CommandRuntimeParams,
  CommandUIParams,
  Port,
  PTBType,
  VariableNode,
} from './graph/types';
import { VAR_OUT } from './portTemplates';
import {
  buildCommandPorts,
  countDefaultOf,
  countKeyOf,
  defaultLabelOf,
  sanitizeCommandUIParams,
} from './registry';
import { KNOWN_IDS } from './seedGraph';

// ------------------------------ ID generator --------------------------------
let localNonce = 0;

/** Fallback for direct factory calls outside a provider-scoped id allocator. */
function createUniqueId(prefix = 'id') {
  return `factory-${prefix}-${++localNonce}`;
}

// ------------------------------- Small helpers -------------------------------
/** IO out-port builder for variables. */
function makeVarOut(dataType: PTBType): Port {
  return { id: VAR_OUT, role: 'io', direction: 'out', dataType };
}

function withoutUndefinedFields<T extends object>(
  value: T | undefined,
): T | undefined {
  if (!value) return undefined;
  const entries = Object.entries(value).filter(
    ([, item]) => item !== undefined,
  );
  return entries.length > 0 ? (Object.fromEntries(entries) as T) : undefined;
}

// --------------------------------- Factories ---------------------------------
/** Create a Command node (flow + IO ports via registry). */
export function makeCommandNode(
  kind: CommandKind,
  opts?: {
    label?: string;
    id?: string;
    ui?: CommandUIParams;
    runtime?: CommandRuntimeParams;
    position?: { x: number; y: number };
  },
): CommandNode {
  const id = opts?.id ?? createUniqueId(`cmd-${kind}`);
  const label = opts?.label ?? defaultLabelOf(kind);
  const runtime = withoutUndefinedFields(opts?.runtime);

  // Seed command UI with default counts when absent.
  const key = countKeyOf(kind);
  const def = countDefaultOf(kind);
  const sanitizedUI = sanitizeCommandUIParams(kind, opts?.ui, runtime);
  const seededUI: CommandUIParams | undefined = (() => {
    if (key && typeof def === 'number') {
      if (
        (sanitizedUI as Record<string, unknown> | undefined)?.[key] ===
        undefined
      ) {
        return { ...(sanitizedUI ?? {}), [key]: def } as CommandUIParams;
      }
    }
    return sanitizedUI;
  })();

  const params =
    seededUI || runtime
      ? {
          ...(seededUI ? { ui: seededUI } : {}),
          ...(runtime ? { runtime } : {}),
        }
      : undefined;

  const node: CommandNode = {
    id,
    kind: 'Command',
    label,
    command: kind,
    params,
    ports: [],
    position: opts?.position ?? { x: 0, y: 0 },
  };

  // Flow + IO ports from the central registry (use seeded UI)
  node.ports = buildCommandPorts(kind, seededUI, runtime);

  return node;
}

/** Create a Variable node (single IO out, no flow). */
export function makeVariableNode(
  varType: PTBType,
  opts?: {
    label?: string;
    id?: string;
    rawInput?: RawCallArg;
    value?: unknown;
    position?: { x: number; y: number };
  },
): VariableNode {
  const id = opts?.id ?? createUniqueId('var');

  const node: VariableNode = {
    id,
    kind: 'Variable',
    label: opts?.label ?? 'var',
    name: '',
    varType,
    ports: [makeVarOut(varType)],
    position: opts?.position ?? { x: 0, y: 0 },
  };
  if (opts && Object.prototype.hasOwnProperty.call(opts, 'value')) {
    if (opts.value !== undefined) node.value = opts.value;
  }
  if (opts?.rawInput !== undefined) node.rawInput = opts.rawInput;
  return node;
}

type VariableFactoryOpts = Omit<
  NonNullable<Parameters<typeof makeVariableNode>[1]>,
  'label'
>;

// ---------------------------- Convenience makers -----------------------------
/** Scalars */
export const makeAddress = (opts?: VariableFactoryOpts) =>
  makeVariableNode(S('address'), { ...opts, label: 'address' });

export const makeNumber = (opts?: VariableFactoryOpts) =>
  makeVariableNode(S('number'), { ...opts, label: 'number' });

export const makeBool = (opts?: VariableFactoryOpts) =>
  makeVariableNode(S('bool'), { ...opts, label: 'bool' });

export const makeString = (opts?: VariableFactoryOpts) =>
  makeVariableNode(S('string'), { ...opts, label: 'string' });

export const makeId = (opts?: VariableFactoryOpts) =>
  makeVariableNode(S('id'), { ...opts, label: 'id' });

export const makeObject = (typeTag?: string, opts?: VariableFactoryOpts) =>
  makeVariableNode(O(typeTag), { ...opts, label: 'object' });

/** Vectors */
export const makeAddressVector = (opts?: VariableFactoryOpts) =>
  makeVariableNode(V(S('address')), { ...opts, label: 'vector<address>' });

export const makeBoolVector = (opts?: VariableFactoryOpts) =>
  makeVariableNode(V(S('bool')), { ...opts, label: 'vector<bool>' });

export const makeStringVector = (opts?: VariableFactoryOpts) =>
  makeVariableNode(V(S('string')), { ...opts, label: 'vector<string>' });

export const makeIdVector = (opts?: VariableFactoryOpts) =>
  makeVariableNode(V(S('id')), { ...opts, label: 'vector<id>' });

/** Move numeric vectors: vector<u8|u16|u32|u64|u128|u256> */
export function makeMoveNumericVector(
  width: 'u8' | 'u16' | 'u32' | 'u64' | 'u128' | 'u256',
  opts?: VariableFactoryOpts,
) {
  return makeVariableNode(V(M(width)), {
    ...opts,
    label: `vector<${width}>`,
  });
}

/** Options */
export const makeAddressOption = (opts?: VariableFactoryOpts) =>
  makeVariableNode(Opt(S('address')), {
    ...opts,
    value: opts?.value ?? NULL_VALUE,
    label: 'option<address>',
  });

export const makeBoolOption = (opts?: VariableFactoryOpts) =>
  makeVariableNode(Opt(S('bool')), {
    ...opts,
    value: opts?.value ?? NULL_VALUE,
    label: 'option<bool>',
  });

export const makeStringOption = (opts?: VariableFactoryOpts) =>
  makeVariableNode(Opt(S('string')), {
    ...opts,
    value: opts?.value ?? NULL_VALUE,
    label: 'option<string>',
  });

export const makeIdOption = (opts?: VariableFactoryOpts) =>
  makeVariableNode(Opt(S('id')), {
    ...opts,
    value: opts?.value ?? NULL_VALUE,
    label: 'option<id>',
  });

/** Move numeric options: option<u8|u16|u32|u64|u128|u256> */
export function makeMoveNumericOption(
  width: 'u8' | 'u16' | 'u32' | 'u64' | 'u128' | 'u256',
  opts?: VariableFactoryOpts,
) {
  return makeVariableNode(Opt(M(width)), {
    ...opts,
    value: opts?.value ?? NULL_VALUE,
    label: `option<${width}>`,
  });
}

// ------------------------------ Well-known var -------------------------------

/** Gas coin object — fixed ID. */
export function makeGasObject(): VariableNode {
  const t = O();
  return {
    id: KNOWN_IDS.GAS,
    kind: 'Variable',
    label: 'gas',
    name: 'gas',
    varType: t,
    semantic: { kind: 'GasCoin' },
    ports: [makeVarOut(t)],
    position: { x: 0, y: 0 },
  };
}
