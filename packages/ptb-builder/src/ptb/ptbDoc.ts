// src/ptb/ptbDoc.ts

// -----------------------------------------------------------------------------
// PTB document model (self-contained; no Sui runtime types).
// - Embeds (modules/objects) are normalized to PTB shapes for offline replay.
// - The document captures only what PTB needs to reconstruct/preview a graph.
// -----------------------------------------------------------------------------

import {
  parsePTBDocV4,
  PTB_DOC_VERSION_V4,
  validatePTBDocV4,
} from '@zktx.io/ptb-model';
import type {
  CommandNode as ModelCommandNode,
  PTBGraph as ModelPTBGraph,
  PTBDocV4,
} from '@zktx.io/ptb-model';

import type { Chain } from '../types';
import type { CommandNode, PTBGraph, PTBType } from './graph/types';

// ----- version ---------------------------------------------------------------

export const PTB_VERSION = PTB_DOC_VERSION_V4;

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

export type PTBDoc = PTBDocV4;

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
  return validatePTBDocV4(x).length === 0;
}

// ----- save helpers ----------------------------------------------------------

/** Strip runtime-only bits from graph before saving. */
export function sanitizeGraphForSave(src: PTBGraph): ModelPTBGraph {
  const nodes = src.nodes.map((n) => {
    const base = {
      id: n.id,
      kind: n.kind,
      ...(n.label !== undefined ? { label: n.label } : {}),
      ports: Array.isArray(n.ports) ? n.ports.map((port) => ({ ...port })) : [],
      ...(n.position ? { position: { ...n.position } } : {}),
    };

    if (n.kind === 'Command') {
      const params = sanitizeCommandParams(n);
      return {
        ...base,
        command: n.command,
        ...(params ? { params } : {}),
      };
    }

    if (n.kind === 'Variable') {
      const anyNode = n as unknown as Record<string, unknown>;
      return {
        ...base,
        name: n.name,
        varType: n.varType,
        ...('value' in anyNode ? { value: anyNode.value } : {}),
        ...('rawInput' in anyNode ? { rawInput: anyNode.rawInput } : {}),
        ...('semantic' in anyNode ? { semantic: anyNode.semantic } : {}),
      };
    }

    return base;
  });

  const edges = src.edges.map((e) => ({ ...e }));
  return { nodes, edges } as ModelPTBGraph;
}

function sanitizeCommandParams(
  command: CommandNode,
): ModelCommandNode['params'] {
  const runtime = sanitizeCommandRuntime(command);
  return runtime ? { runtime } : undefined;
}

function sanitizeCommandRuntime(
  command: CommandNode,
): Record<string, unknown> | undefined {
  const runtime =
    command.params?.runtime && typeof command.params.runtime === 'object'
      ? { ...(command.params.runtime as Record<string, unknown>) }
      : {};
  const ui =
    command.params?.ui && typeof command.params.ui === 'object'
      ? (command.params.ui as Record<string, unknown>)
      : {};

  if (command.command === 'moveCall') {
    if (typeof runtime.target !== 'string') {
      const pkgId = typeof ui.pkgId === 'string' ? ui.pkgId : undefined;
      const moduleName = typeof ui.module === 'string' ? ui.module : undefined;
      const functionName = typeof ui.func === 'string' ? ui.func : undefined;
      if (pkgId && moduleName && functionName) {
        runtime.target = `${pkgId}::${moduleName}::${functionName}`;
      }
    }
    if (!Array.isArray(runtime.typeArguments)) {
      delete runtime.typeArguments;
    }
  }

  return Object.keys(runtime).length > 0 ? runtime : undefined;
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

  const doc = {
    version: PTB_VERSION,
    chain,
    sender,
    view,
    graph: sanitizeGraphForSave(graph),
    modules,
    objects,
  };

  return parsePTBDocV4(doc);
}

/** Parse and validate a JSON object into PTBDoc (new-only). */
export function parseDoc(json: unknown): PTBDoc {
  return parsePTBDocV4(json);
}
