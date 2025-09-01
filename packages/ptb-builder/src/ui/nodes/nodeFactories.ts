// src/ui/nodes/nodeFactories.ts
// -----------------------------------------------------------------------------
// Factory for PTB nodes (Start/End/Variables/Commands).
//
// Key rules
// - CommandKind is canonical (camelCase) across the app.
// - Command ports are materialized from a single source of truth (registry).
// - Default UI params are injected HERE (single choke point).
//
// IDs
// - Regular nodes use createUniqueId(prefix).
// - Well-known singletons (start/end/gas/system/clock/random/my_wallet)
//   ALWAYS use fixed IDs from KNOWN_IDS (never randomized).
//
// Deduplication
// - This module does NOT deduplicate nodes. The provider/decoder should check
//   presence first and avoid creating duplicates.
//
// Dependency Injection (ID)
// - Apps may inject a doc-scoped generator via setIdGenerator() to ensure
//   collision-free IDs across loads/macros (e.g. `${prefix}-${++nonce}`).
// -----------------------------------------------------------------------------

import { materializeCommandPorts } from './cmds/registry';
import { O, S, V } from '../../ptb/graph/typeHelpers';
import type {
  CommandKind,
  CommandNode,
  Port,
  PTBNode,
  PTBType,
  VariableNode,
} from '../../ptb/graph/types';
import { FLOW_NEXT, FLOW_PREV, VAR_OUT } from '../../ptb/portTemplates';
import { KNOWN_IDS } from '../../ptb/seedGraph';

/* ----------------------------- ID generator (DI) ---------------------------- */
// Default: simple monotonic nonce in module scope.
// Apps may inject a doc-scoped generator: setIdGenerator((p) => `${p}-${++n}`)
let _localNonce = 0;
let _idGen: (prefix?: string) => string = (prefix = 'id') =>
  `${prefix}-${++_localNonce}`;

/** Replace the ID generator used by factories. */
export function setIdGenerator(gen: (prefix?: string) => string) {
  _idGen = typeof gen === 'function' ? gen : _idGen;
}

/** Centralized helper to generate unique IDs with an optional prefix. */
export function createUniqueId(prefix?: string) {
  return _idGen(prefix);
}

/* --------------------------------- Helpers --------------------------------- */
function outPort(dataType: PTBType): Port {
  return { id: VAR_OUT, role: 'io', direction: 'out', dataType };
}

/** Pretty type → human label for variables. */
function labelFromType(t: PTBType): string {
  const k = (t as any)?.kind;
  if (k === 'scalar') return (t as any)?.name || 'unknown';
  if (k === 'object') return 'object';
  if (k === 'vector') return `vector<${labelFromType((t as any).elem)}>`;
  return 'unknown';
}

/* --------------------------- UI defaults injector --------------------------- */
/** Apply per-command UI defaults (idempotent). */
function withUIDefaults(
  kind: CommandKind,
  ui: Record<string, unknown> = {},
): Record<string, unknown> {
  switch (kind) {
    case 'splitCoins':
      // Expanded → N individual outputs (defaults N=2)
      ui.amountsExpanded ??= false;
      ui.amountsCount ??= 2;
      break;
    case 'mergeCoins':
      ui.sourcesExpanded ??= false;
      ui.sourcesCount ??= 2;
      break;
    case 'transferObjects':
      ui.objectsExpanded ??= false;
      ui.objectsCount ??= 2;
      break;
    case 'makeMoveVec':
      ui.elemsExpanded ??= false;
      ui.elemsCount ??= 2;
      // elemType is optional; registry will default to object if not set
      break;
    default:
      // other commands: no UI defaults
      break;
  }
  return ui;
}

/* -------------------------------- Factories -------------------------------- */
export const NodeFactories = {
  /* Start node — fixed ID */
  start(): PTBNode {
    const flowOut: Port = { id: FLOW_NEXT, role: 'flow', direction: 'out' };
    return {
      id: KNOWN_IDS.START, // fixed, never random
      kind: 'Start',
      label: 'Start',
      ports: [flowOut],
      position: { x: 0, y: 0 },
    };
  },

  /* End node — fixed ID */
  end(): PTBNode {
    const flowIn: Port = { id: FLOW_PREV, role: 'flow', direction: 'in' };
    return {
      id: KNOWN_IDS.END, // fixed, never random
      kind: 'End',
      label: 'End',
      ports: [flowIn],
      position: { x: 0, y: 0 },
    };
  },

  /* Command node — canonical CommandKind
   * - Inject default UI params here
   * - Materialize ports from registry using the node (so UI affects ports immediately)
   */
  command(
    kind: CommandKind,
    opts?: {
      label?: string;
      ui?: Record<string, unknown>;
      runtime?: Record<string, unknown>;
      position?: { x: number; y: number };
    },
  ): CommandNode {
    const id = createUniqueId(`cmd-${kind}`);
    const label = opts?.label ?? kind;

    // Merge defaults + user overrides
    const ui = withUIDefaults(kind, { ...(opts?.ui ?? {}) });
    const runtime = { ...(opts?.runtime ?? {}) };

    // Build a minimal node to let registry compute ports based on UI
    const draftNode: CommandNode = {
      id,
      kind: 'Command',
      label,
      command: kind,
      params: { ui, runtime },
      ports: [], // will be materialized next
      position: opts?.position ?? { x: 0, y: 0 },
    };

    // Materialize ports from the single source of truth (registry)
    const ports = materializeCommandPorts(draftNode);

    // Return finalized command node
    return { ...draftNode, ports };
  },

  /* Generic variable node (used by decoder, inspectors, etc.) */
  variable(
    varType: PTBType,
    opts?: {
      name?: string;
      label?: string;
      value?: unknown;
      position?: { x: number; y: number };
    },
  ): VariableNode {
    const id = createUniqueId('var');
    const label = opts?.label ?? labelFromType(varType);
    return {
      id,
      kind: 'Variable',
      label,
      name: opts?.name ?? 'var',
      varType,
      value: opts?.value,
      ports: [outPort(varType)],
      position: opts?.position ?? { x: 0, y: 0 },
    };
  },

  // ----------------------------- Convenience set -----------------------------

  address(): VariableNode {
    const t = S('address');
    return {
      id: createUniqueId('addr'),
      kind: 'Variable',
      label: 'address',
      name: 'addr',
      varType: t,
      ports: [outPort(t)],
      position: { x: 0, y: 0 },
    };
  },
  addressVector(): VariableNode {
    const t = V(S('address'));
    return {
      id: createUniqueId('addr-vec'),
      kind: 'Variable',
      label: 'vector<address>',
      name: 'v_address',
      varType: t,
      ports: [outPort(t)],
      position: { x: 0, y: 0 },
    };
  },

  /** My wallet address — fixed ID */
  addressWallet(): VariableNode {
    const t = S('address');
    return {
      id: KNOWN_IDS.MY_WALLET, // fixed, never random
      kind: 'Variable',
      label: 'my wallet',
      name: 'sender',
      varType: t,
      ports: [outPort(t)],
      position: { x: 0, y: 0 },
    };
  },

  // Bool
  bool(): VariableNode {
    const t = S('bool');
    return {
      id: createUniqueId('bool'),
      kind: 'Variable',
      label: 'bool',
      name: 'flag',
      varType: t,
      ports: [outPort(t)],
      position: { x: 0, y: 0 },
    };
  },
  boolVector(): VariableNode {
    const t = V(S('bool'));
    return {
      id: createUniqueId('bool-vec'),
      kind: 'Variable',
      label: 'vector<bool>',
      name: 'v_bool',
      varType: t,
      ports: [outPort(t)],
      position: { x: 0, y: 0 },
    };
  },

  // Number (UI-unified)
  number(): VariableNode {
    const t = S('number');
    return {
      id: createUniqueId('var-number'),
      kind: 'Variable',
      label: 'number',
      name: 'num',
      varType: t,
      ports: [outPort(t)],
      position: { x: 0, y: 0 },
    };
  },

  numberVector(): VariableNode {
    const t = V(S('number'));
    return {
      id: createUniqueId('var-number-vec'),
      kind: 'Variable',
      label: 'vector<number>',
      name: 'nums',
      varType: t,
      ports: [outPort(t)],
      position: { x: 0, y: 0 },
    };
  },

  // String
  string(): VariableNode {
    const t = S('string');
    return {
      id: createUniqueId('str'),
      kind: 'Variable',
      label: 'string',
      name: 'text',
      varType: t,
      ports: [outPort(t)],
      position: { x: 0, y: 0 },
    };
  },
  stringVector(): VariableNode {
    const t = V(S('string'));
    return {
      id: createUniqueId('str-vec'),
      kind: 'Variable',
      label: 'vector<string>',
      name: 'v_string',
      varType: t,
      ports: [outPort(t)],
      position: { x: 0, y: 0 },
    };
  },
  string0x2suiSui(): VariableNode {
    const t = S('string');
    return {
      id: createUniqueId('sui-str'),
      kind: 'Variable',
      label: '0x2::sui::SUI',
      name: 'sui',
      value: '0x2::sui::SUI',
      varType: t,
      ports: [outPort(t)],
      position: { x: 0, y: 0 },
    };
  },

  // Object (generic)
  object(): VariableNode {
    const t = O();
    return {
      id: createUniqueId('obj'),
      kind: 'Variable',
      label: 'object',
      name: 'obj',
      varType: t,
      ports: [outPort(t)],
      position: { x: 0, y: 0 },
    };
  },
  objectVector(): VariableNode {
    const t = V(O());
    return {
      id: createUniqueId('obj-vec'),
      kind: 'Variable',
      label: 'vector<object>',
      name: 'v_object',
      varType: t,
      ports: [outPort(t)],
      position: { x: 0, y: 0 },
    };
  },

  /** Clock object — fixed ID */
  objectClock(): VariableNode {
    const t = O();
    return {
      id: KNOWN_IDS.CLOCK, // fixed, never random
      kind: 'Variable',
      label: 'clock',
      name: 'clock',
      varType: t,
      ports: [outPort(t)],
      position: { x: 0, y: 0 },
    };
  },
  /** Gas coin object — fixed ID */
  objectGas(): VariableNode {
    const t = O();
    return {
      id: KNOWN_IDS.GAS, // fixed, never random
      kind: 'Variable',
      label: 'gas',
      name: 'gas',
      varType: t,
      ports: [outPort(t)],
      position: { x: 0, y: 0 },
    };
  },
  objectCoinWithBalance(): VariableNode {
    const t = O();
    return {
      id: createUniqueId('coin-bal'),
      kind: 'Variable',
      label: 'coinWithBalance',
      name: 'coinWithBalance',
      varType: t,
      ports: [outPort(t)],
      position: { x: 0, y: 0 },
    };
  },
  objectDenyList(): VariableNode {
    const t = O();
    return {
      id: createUniqueId('deny'),
      kind: 'Variable',
      label: 'denyList',
      name: 'denyList',
      varType: t,
      ports: [outPort(t)],
      position: { x: 0, y: 0 },
    };
  },

  objectOption(): VariableNode {
    const t = O();
    return {
      id: createUniqueId('opt'),
      kind: 'Variable',
      label: 'option',
      name: 'option',
      varType: t,
      ports: [outPort(t)],
      position: { x: 0, y: 0 },
    };
  },
  /** Random object — fixed ID */
  objectRandom(): VariableNode {
    const t = O();
    return {
      id: KNOWN_IDS.RANDOM, // fixed, never random
      kind: 'Variable',
      label: 'random',
      name: 'random',
      varType: t,
      ports: [outPort(t)],
      position: { x: 0, y: 0 },
    };
  },
  /** System object — fixed ID */
  objectSystem(): VariableNode {
    const t = O();
    return {
      id: KNOWN_IDS.SYSTEM, // fixed, never random
      kind: 'Variable',
      label: 'system',
      name: 'system',
      varType: t,
      ports: [outPort(t)],
      position: { x: 0, y: 0 },
    };
  },
};

export { withUIDefaults, labelFromType };
