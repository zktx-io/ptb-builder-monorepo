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

  // Seed command UI with default counts when absent.
  const key = countKeyOf(kind);
  const def = countDefaultOf(kind);
  const seededUI: CommandUIParams | undefined = (() => {
    const base = opts?.ui ? { ...opts.ui } : undefined;
    if (key && typeof def === 'number') {
      if (!base || typeof (base as any)[key] !== 'number') {
        return { ...(base ?? {}), [key]: def } as CommandUIParams;
      }
    }
    return base;
  })();

  const runtime = opts?.runtime ? { ...opts.runtime } : undefined;

  const node: CommandNode = {
    id,
    kind: 'Command',
    label,
    command: kind,
    params:
      seededUI || runtime
        ? {
            ui: seededUI,
            runtime,
          }
        : undefined,
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

  return {
    id,
    kind: 'Variable',
    label: opts?.label ?? 'var',
    name: '',
    varType,
    value: opts?.value,
    rawInput: opts?.rawInput,
    ports: [makeVarOut(varType)],
    position: opts?.position ?? { x: 0, y: 0 },
  };
}

// ---------------------------- Convenience makers -----------------------------
/** Scalars */
export const makeAddress = (
  opts?: Omit<Parameters<typeof makeVariableNode>[1], 'label'>,
) => makeVariableNode(S('address'), { ...opts, label: 'address' });

export const makeNumber = (
  opts?: Omit<Parameters<typeof makeVariableNode>[1], 'label'>,
) => makeVariableNode(S('number'), { ...opts, label: 'number' });

export const makeBool = (
  opts?: Omit<Parameters<typeof makeVariableNode>[1], 'label'>,
) => makeVariableNode(S('bool'), { ...opts, label: 'bool' });

export const makeString = (
  opts?: Omit<Parameters<typeof makeVariableNode>[1], 'label'>,
) => makeVariableNode(S('string'), { ...opts, label: 'string' });

export const makeId = (
  opts?: Omit<Parameters<typeof makeVariableNode>[1], 'label'>,
) => makeVariableNode(S('id'), { ...opts, label: 'id' });

export const makeObject = (
  typeTag?: string,
  opts?: Omit<Parameters<typeof makeVariableNode>[1], 'label'>,
) => makeVariableNode(O(typeTag), { ...opts, label: 'object' });

/** Vectors */
export const makeAddressVector = (
  opts?: Omit<Parameters<typeof makeVariableNode>[1], 'label'>,
) => makeVariableNode(V(S('address')), { ...opts, label: 'vector<address>' });

export const makeBoolVector = (
  opts?: Omit<Parameters<typeof makeVariableNode>[1], 'label'>,
) => makeVariableNode(V(S('bool')), { ...opts, label: 'vector<bool>' });

export const makeStringVector = (
  opts?: Omit<Parameters<typeof makeVariableNode>[1], 'label'>,
) => makeVariableNode(V(S('string')), { ...opts, label: 'vector<string>' });

export const makeIdVector = (
  opts?: Omit<Parameters<typeof makeVariableNode>[1], 'label'>,
) => makeVariableNode(V(S('id')), { ...opts, label: 'vector<id>' });

/** Move numeric vectors: vector<u8|u16|u32|u64|u128|u256> */
export function makeMoveNumericVector(
  width: 'u8' | 'u16' | 'u32' | 'u64' | 'u128' | 'u256',
  opts?: Omit<Parameters<typeof makeVariableNode>[1], 'label'>,
) {
  return makeVariableNode(V(M(width)), {
    ...opts,
    label: `vector<${width}>`,
  });
}

/** Options */
export const makeAddressOption = (
  opts?: Omit<Parameters<typeof makeVariableNode>[1], 'label'>,
) =>
  makeVariableNode(Opt(S('address')), {
    value: NULL_VALUE,
    ...opts,
    label: 'option<address>',
  });

export const makeBoolOption = (
  opts?: Omit<Parameters<typeof makeVariableNode>[1], 'label'>,
) =>
  makeVariableNode(Opt(S('bool')), {
    value: NULL_VALUE,
    ...opts,
    label: 'option<bool>',
  });

export const makeStringOption = (
  opts?: Omit<Parameters<typeof makeVariableNode>[1], 'label'>,
) =>
  makeVariableNode(Opt(S('string')), {
    value: NULL_VALUE,
    ...opts,
    label: 'option<string>',
  });

export const makeIdOption = (
  opts?: Omit<Parameters<typeof makeVariableNode>[1], 'label'>,
) =>
  makeVariableNode(Opt(S('id')), {
    value: NULL_VALUE,
    ...opts,
    label: 'option<id>',
  });

/** Move numeric options: option<u8|u16|u32|u64|u128|u256> */
export function makeMoveNumericOption(
  width: 'u8' | 'u16' | 'u32' | 'u64' | 'u128' | 'u256',
  opts?: Omit<Parameters<typeof makeVariableNode>[1], 'label'>,
) {
  return makeVariableNode(Opt(M(width)), {
    value: NULL_VALUE,
    ...opts,
    label: `option<${width}>`,
  });
}

// ------------------------------ Well-known vars ------------------------------

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

/** Clock object — fixed ID. */
export function makeClockObject(): VariableNode {
  const t = O();
  return {
    id: KNOWN_IDS.CLOCK,
    kind: 'Variable',
    label: 'clock',
    name: 'clock',
    varType: t,
    ports: [makeVarOut(t)],
    position: { x: 0, y: 0 },
  };
}

/** Random object — fixed ID. */
export function makeRandomObject(): VariableNode {
  const t = O();
  return {
    id: KNOWN_IDS.RANDOM,
    kind: 'Variable',
    label: 'random',
    name: 'random',
    varType: t,
    ports: [makeVarOut(t)],
    position: { x: 0, y: 0 },
  };
}

/** System object — fixed ID. */
export function makeSystemObject(): VariableNode {
  const t = O();
  return {
    id: KNOWN_IDS.SYSTEM,
    kind: 'Variable',
    label: 'system',
    name: 'system',
    varType: t,
    ports: [makeVarOut(t)],
    position: { x: 0, y: 0 },
  };
}
