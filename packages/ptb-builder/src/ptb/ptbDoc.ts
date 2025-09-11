// src/ptb/ptbDoc.ts

// -----------------------------------------------------------------------------
// PTB document model (self-contained; no Sui runtime types).
// - Embeds (modules/objects) are normalized to PTB shapes for offline replay.
// - The document captures only what PTB needs to reconstruct/preview a graph.
// -----------------------------------------------------------------------------

import type { Chain } from '../types';
import type {
  CommandNode,
  PTBEdge,
  PTBGraph,
  PTBNode,
  PTBType,
} from './graph/types';

// ----- version ---------------------------------------------------------------

export const PTB_VERSION = 'ptb_3' as const;

// ----- normalized ABI --------------------------------------------------------

/**
 * Normalized function table for a single module.
 * key: function name → { tparamCount, ins, outs }
 */
export type PTBFunctionData = Record<
  string,
  {
    /** Generic placeholders; the concrete type tags live elsewhere (SSOT). */
    tparamCount: number;
    /** Normalized PTB input types (order-preserving). */
    ins: PTBType[];
    /** Normalized PTB output types (order-preserving). */
    outs: PTBType[];
  }
>;

/** Modules embed kept in the document (package → module → functions). */
export type PTBModulesEmbed = Record<
  string, // package id (0x…)
  Record<
    string, // module name
    PTBFunctionData
  >
>;

/** Objects embed kept in the document (object id → minimal snapshot). */
export type PTBObjectsEmbed = Record<
  string, // object id (0x…)
  PTBObjectData
>;

// ----- minimal object snapshot -----------------------------------------------

/** Minimal object snapshot used by PTB when reproducing a graph offline. */
export interface PTBObjectData {
  /** Sui object id. */
  objectId: string;
  /**
   * Fully-qualified type tag, e.g.:
   *   0x2::coin::Coin<0x2::sui::SUI>
   */
  typeTag: string;
}

// ----- document --------------------------------------------------------------

export interface PTBDoc {
  /** File identifier + version */
  version: typeof PTB_VERSION;

  /** Required active chain for this document */
  chain: Chain;

  /** Transaction sender (wallet address or extracted from tx) */
  sender?: string;

  /** PTB graph (required) */
  graph: PTBGraph;

  /** Required normalized embeds */
  modules?: PTBModulesEmbed;
  objects?: PTBObjectsEmbed;

  /** Optional editor viewport state */
  view: { x: number; y: number; zoom: number };
}

// ----- validation (strict: new format only) ----------------------------------

/** Narrow check for PTBFunctionData entry. */
function isPTBFunctionEntry(x: unknown): x is {
  tparamCount: number;
  ins: PTBType[];
  outs: PTBType[];
} {
  if (!x || typeof x !== 'object') return false;
  const e = x as any;
  return (
    typeof e.tparamCount === 'number' &&
    Array.isArray(e.ins) &&
    Array.isArray(e.outs)
  );
}

/** Narrow check for PTBFunctionData. */
function isPTBFunctionData(x: unknown): x is PTBFunctionData {
  if (!x || typeof x !== 'object' || Array.isArray(x)) return false;
  for (const v of Object.values(x as Record<string, unknown>)) {
    if (!isPTBFunctionEntry(v)) return false;
  }
  return true;
}

/** Narrow check for PTBModulesEmbed. */
export function isPTBModulesEmbed(x: unknown): x is PTBModulesEmbed {
  if (!x || typeof x !== 'object' || Array.isArray(x)) return false;
  for (const modMap of Object.values(x as Record<string, unknown>)) {
    if (!modMap || typeof modMap !== 'object' || Array.isArray(modMap))
      return false;
    for (const fnMap of Object.values(modMap as Record<string, unknown>)) {
      if (!isPTBFunctionData(fnMap)) return false;
    }
  }
  return true;
}

/** Narrow check for PTBObjectsEmbed. */
export function isPTBObjectsEmbed(x: unknown): x is PTBObjectsEmbed {
  if (!x || typeof x !== 'object' || Array.isArray(x)) return false;
  for (const v of Object.values(x as Record<string, unknown>)) {
    if (!v || typeof v !== 'object' || Array.isArray(v)) return false;
    const o = v as any;
    if (typeof o.objectId !== 'string' || typeof o.typeTag !== 'string') {
      return false;
    }
  }
  return true;
}

/** Narrow check for PTBDoc (new-only). */
export function isPTBDoc(x: unknown): x is PTBDoc {
  if (!x || typeof x !== 'object') return false;
  const v = (x as any).version;
  const c = (x as any).chain;
  const g = (x as any).graph;
  const me = (x as any).modules;
  const oe = (x as any).objects;

  return (
    v === PTB_VERSION &&
    !!c &&
    !!g &&
    Array.isArray(g.nodes) &&
    Array.isArray(g.edges) &&
    isPTBModulesEmbed(me) &&
    isPTBObjectsEmbed(oe)
  );
}

// ----- save helpers ----------------------------------------------------------

/** Strip runtime-only bits from graph before saving. */
export function sanitizeGraphForSave(src: PTBGraph): PTBGraph {
  const nodes: PTBNode[] = src.nodes.map((n) => {
    const nn: PTBNode = {
      ...n,
      // Shallow-copy ports to avoid retaining ephemeral references
      ports: Array.isArray(n.ports) ? [...n.ports] : [],
    } as PTBNode;

    // Remove command runtime params
    if (nn.kind === 'Command') {
      const c = nn as CommandNode;
      const prevParams = c.params ?? {};
      const { runtime, ...rest } = prevParams as Record<string, unknown>;
      c.params = Object.keys(rest).length ? (rest as any) : undefined;
    }

    // NOTE: If PTBNode contains additional UI-only flags later (e.g., hovered),
    // strip here in the same manner to keep the on-disk shape stable.
    return nn;
  });

  const edges: PTBEdge[] = src.edges.map((e) => ({ ...e }));
  return { nodes, edges };
}

/** Build a PTB document (accepts only normalized embed shapes). */
export function buildDoc(opts: {
  chain: Chain;
  graph: PTBGraph;
  sender?: string;
  view: { x: number; y: number; zoom: number };
  modules: PTBModulesEmbed | unknown;
  objects: PTBObjectsEmbed | unknown;
}): PTBDoc {
  const { chain, graph, sender, view } = opts;

  const modules: PTBModulesEmbed = isPTBModulesEmbed(opts.modules)
    ? (opts.modules as PTBModulesEmbed)
    : {};
  const objects: PTBObjectsEmbed = isPTBObjectsEmbed(opts.objects)
    ? (opts.objects as PTBObjectsEmbed)
    : {};

  const doc: PTBDoc = {
    version: PTB_VERSION,
    chain,
    sender,
    view,
    graph: sanitizeGraphForSave(graph),
    modules,
    objects,
  };

  return doc;
}

/** Parse and validate a JSON object into PTBDoc (new-only). */
export function parseDoc(json: unknown): PTBDoc {
  if (!isPTBDoc(json)) throw new Error('Invalid PTB document');
  return json as PTBDoc;
}
