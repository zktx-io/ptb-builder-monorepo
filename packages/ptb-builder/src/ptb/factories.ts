// src/ptb/factories.ts

// -----------------------------------------------------------------------------
// Pure PTB node factories (domain-level, UI-agnostic).
// - Variable nodes: no flow ports (IO out only).
// - Command nodes: flow+IO ports are provided by the central registry.
// - ID generation is injectable (doc-scoped monotonicity via setIdGenerator).
// - UI count defaults for commands are seeded automatically when absent,
//   so the initial port sets always reflect a usable default.
// - IMPORTANT: while the model allows vector<object>/option<object> for forward
//   compatibility, UI-level creation currently disallows them.
// -----------------------------------------------------------------------------

import { M, O, Opt, S, V } from './graph/typeHelpers';
import type {
  CommandKind,
  CommandNode,
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

// ------------------------------ ID generator (DI) ----------------------------
let _localNonce = 0;
let _idGen: (prefix?: string) => string = (prefix = 'id') =>
  `${prefix}-${++_localNonce}`;

/** Replace the ID generator used by factories (doc-scoped recommended). */
export function setIdGenerator(gen: (prefix?: string) => string) {
  if (typeof gen === 'function') _idGen = gen;
}

/** Centralized helper to generate unique IDs with an optional prefix. */
export function createUniqueId(prefix?: string) {
  return _idGen(prefix);
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
    ui?: CommandUIParams;
    runtime?: Record<string, unknown>;
    position?: { x: number; y: number };
  },
): CommandNode {
  const id = createUniqueId(`cmd-${kind}`);
  const label = opts?.label ?? defaultLabelOf(kind);

  // --- seed UI with default count when absent (fundamental fix) ---
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
  node.ports = buildCommandPorts(kind, seededUI);

  return node;
}

/** Create a Variable node (single IO out, no flow). */
export function makeVariableNode(
  varType: PTBType,
  opts?: {
    name?: string;
    label?: string;
    value?: unknown;
    position?: { x: number; y: number };
  },
): VariableNode {
  const id = createUniqueId('var');

  return {
    id,
    kind: 'Variable',
    label: opts?.label ?? 'var',
    name: opts?.name ?? 'var',
    varType,
    value: opts?.value,
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

export const makeNumberVector = (
  opts?: Omit<Parameters<typeof makeVariableNode>[1], 'label'>,
) => makeVariableNode(V(S('number')), { ...opts, label: 'vector<number>' });

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
) => makeVariableNode(Opt(S('address')), { ...opts, label: 'option<address>' });

export const makeNumberOption = (
  opts?: Omit<Parameters<typeof makeVariableNode>[1], 'label'>,
) => makeVariableNode(Opt(S('number')), { ...opts, label: 'option<number>' });

export const makeBoolOption = (
  opts?: Omit<Parameters<typeof makeVariableNode>[1], 'label'>,
) => makeVariableNode(Opt(S('bool')), { ...opts, label: 'option<bool>' });

export const makeStringOption = (
  opts?: Omit<Parameters<typeof makeVariableNode>[1], 'label'>,
) => makeVariableNode(Opt(S('string')), { ...opts, label: 'option<string>' });

export const makeIdOption = (
  opts?: Omit<Parameters<typeof makeVariableNode>[1], 'label'>,
) => makeVariableNode(Opt(S('id')), { ...opts, label: 'option<id>' });

/** Move numeric options: option<u8|u16|u32|u64|u128|u256> */
export function makeMoveNumericOption(
  width: 'u8' | 'u16' | 'u32' | 'u64' | 'u128' | 'u256',
  opts?: Omit<Parameters<typeof makeVariableNode>[1], 'label'>,
) {
  return makeVariableNode(Opt(M(width)), {
    ...opts,
    label: `option<${width}>`,
  });
}

// ------------------------------ Well-known vars ------------------------------
/** My wallet address — fixed ID (callers should dedupe). */
export function makeWalletAddress(): VariableNode {
  const t = S('address');
  return {
    id: KNOWN_IDS.MY_WALLET,
    kind: 'Variable',
    label: 'my wallet',
    name: 'sender',
    varType: t,
    ports: [makeVarOut(t)],
    position: { x: 0, y: 0 },
  };
}

/** Gas coin object — fixed ID. */
export function makeGasObject(): VariableNode {
  const t = O();
  return {
    id: KNOWN_IDS.GAS,
    kind: 'Variable',
    label: 'gas',
    name: 'gas',
    varType: t,
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

// ------------------------------ Optional helpers -----------------------------
/** Convenience: vector token → variable node (for menu/shortcuts). */
export function makeFromVectorToken(
  token:
    | 'address'
    | 'number'
    | 'bool'
    | 'string'
    | 'id'
    | 'u8'
    | 'u16'
    | 'u32'
    | 'u64'
    | 'u128'
    | 'u256',
): VariableNode {
  switch (token) {
    case 'address':
      return makeAddressVector();
    case 'number':
      return makeNumberVector();
    case 'bool':
      return makeBoolVector();
    case 'string':
      return makeStringVector();
    case 'id':
      return makeIdVector();
    // move numeric widths
    case 'u8':
    case 'u16':
    case 'u32':
    case 'u64':
    case 'u128':
    case 'u256':
      return makeMoveNumericVector(token);
  }
}

/** Convenience: scalar token → variable node. */
export function makeFromScalarToken(
  token: 'address' | 'number' | 'bool' | 'string' | 'id' | 'object',
): VariableNode {
  switch (token) {
    case 'address':
      return makeAddress();
    case 'number':
      return makeNumber();
    case 'bool':
      return makeBool();
    case 'string':
      return makeString();
    case 'id':
      return makeId();
    case 'object':
      return makeObject();
  }
}
