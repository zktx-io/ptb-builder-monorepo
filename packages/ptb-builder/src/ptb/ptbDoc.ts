// src/ptb/ptbDoc.ts

// -----------------------------------------------------------------------------
// PTB document model (self-contained; no Sui runtime types).
// - Embeds (modules/objects) are normalized to PTB shapes for offline replay.
// - The document captures only what PTB needs to reconstruct/preview a graph.
// -----------------------------------------------------------------------------

import {
  isPTBType,
  parsePTBDocV4,
  PTB_DOC_VERSION_V4,
  validatePTBDocV4,
} from '@zktx.io/ptb-model';
import type {
  CommandNode as ModelCommandNode,
  PTBGraph as ModelPTBGraph,
  PTBNode as ModelPTBNode,
  PTBDocV4,
} from '@zktx.io/ptb-model';

import { isSuiChain } from '../types';
import type { Chain } from '../types';
import type { CommandNode, PTBGraph, PTBType } from './graph/types';

type PTBView = { x: number; y: number; zoom: number };

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

export type PTBDoc = PTBDocV4 & {
  chain: Chain;
  view: PTBView;
  modules?: PTBModulesEmbed;
  objects?: PTBObjectsEmbed;
};
export type LoadedPTBDocState = {
  doc: PTBDoc;
  chain: Chain;
  view: PTBView;
  modules: PTBModulesEmbed;
  objects: PTBObjectsEmbed;
  graph: PTBGraph;
};

// ----- validation (strict: new format only) ----------------------------------

const PTB_FUNCTION_ENTRY_KEYS = ['tparamCount', 'ins', 'outs'] as const;
const PTB_OBJECT_DATA_KEYS = ['objectId', 'typeTag'] as const;

/** Narrow check for PTBFunctionData entry. */
function isPTBFunctionEntry(x: unknown): x is {
  tparamCount: number;
  ins: PTBType[];
  outs: PTBType[];
} {
  if (!x || typeof x !== 'object' || Array.isArray(x)) return false;
  const e = x as any;
  return (
    hasOnlyKeys(e, PTB_FUNCTION_ENTRY_KEYS) &&
    Number.isInteger(e.tparamCount) &&
    e.tparamCount >= 0 &&
    isPTBTypeArray(e.ins) &&
    isPTBTypeArray(e.outs)
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
    if (
      !hasOnlyKeys(o, PTB_OBJECT_DATA_KEYS) ||
      typeof o.objectId !== 'string' ||
      typeof o.typeTag !== 'string'
    ) {
      return false;
    }
  }
  return true;
}

/** Narrow check for PTBDoc (new-only). */
export function isPTBDoc(x: unknown): x is PTBDoc {
  try {
    parseDoc(x);
    return true;
  } catch {
    return false;
  }
}

// ----- save helpers ----------------------------------------------------------

/** Strip runtime-only bits from graph before saving. */
export function sanitizeGraphForSave(src: PTBGraph): ModelPTBGraph {
  const nodes: ModelPTBGraph['nodes'] = src.nodes.map((n): ModelPTBNode => {
    const base = {
      id: n.id,
      ...(n.label !== undefined ? { label: n.label } : {}),
      ports: Array.isArray(n.ports) ? n.ports.map((port) => ({ ...port })) : [],
      ...(n.position ? { position: { ...n.position } } : {}),
    };

    if (n.kind === 'Command') {
      const params = sanitizeCommandParams(n);
      return {
        ...base,
        kind: 'Command',
        command: n.command,
        ...(params ? { params } : {}),
      };
    }

    if (n.kind === 'Variable') {
      return {
        ...base,
        kind: 'Variable',
        name: n.name,
        varType: n.varType,
        ...('value' in n ? { value: n.value } : {}),
        ...(n.rawInput !== undefined ? { rawInput: n.rawInput } : {}),
        ...(n.semantic !== undefined ? { semantic: n.semantic } : {}),
      };
    }

    if (n.kind === 'Start') {
      return { ...base, kind: 'Start' };
    }

    if (n.kind === 'End') {
      return { ...base, kind: 'End' };
    }

    return unsupportedPTBNodeKind(n);
  });

  const edges: ModelPTBGraph['edges'] = src.edges.map((e) => ({ ...e }));
  return { nodes, edges };
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

  const modules = requirePTBModulesEmbed(opts.modules);
  const objects = requirePTBObjectsEmbed(opts.objects);

  const doc = {
    version: PTB_VERSION,
    chain,
    sender,
    view,
    graph: sanitizeGraphForSave(graph),
    modules,
    objects,
  };

  return parseDoc(doc);
}

/** Parse and validate a JSON object into PTBDoc (new-only). */
export function parseDoc(json: unknown): PTBDoc {
  const doc = parsePTBDocV4(json);
  const chain = parseDocChain(doc.chain);
  if (!chain) {
    throw new Error('Invalid or missing chain in PTB document.');
  }
  if (!doc.view) {
    throw new Error('Invalid or missing view in PTB document.');
  }
  requirePTBModulesEmbed(doc.modules ?? {});
  requirePTBObjectsEmbed(doc.objects ?? {});
  return doc as PTBDoc;
}

export function prepareLoadedDoc(value: unknown): LoadedPTBDocState {
  const doc = parseDoc(value);
  const modules = requirePTBModulesEmbed(doc.modules ?? {});
  const objects = requirePTBObjectsEmbed(doc.objects ?? {});

  return {
    doc,
    chain: doc.chain,
    view: doc.view,
    modules,
    objects,
    graph: toBuilderGraph(doc.graph),
  };
}

function requirePTBModulesEmbed(value: unknown): PTBModulesEmbed {
  if (isPTBModulesEmbed(value)) return value;
  throw new Error(
    'PTB document modules must match the PTB modules embed shape.',
  );
}

function requirePTBObjectsEmbed(value: unknown): PTBObjectsEmbed {
  if (isPTBObjectsEmbed(value)) return value;
  throw new Error(
    'PTB document objects must match the PTB objects embed shape.',
  );
}

function parseDocChain(value: unknown): Chain | undefined {
  if (typeof value !== 'string') return undefined;
  const chain = value.trim();
  return isSuiChain(chain) ? chain : undefined;
}

function hasOnlyKeys(
  value: Record<string, unknown>,
  allowedKeys: readonly string[],
): boolean {
  return Object.keys(value).every((key) => allowedKeys.includes(key));
}

function isDenseArray(value: unknown): value is unknown[] {
  if (!Array.isArray(value)) return false;
  for (let index = 0; index < value.length; index += 1) {
    if (!Object.prototype.hasOwnProperty.call(value, index)) return false;
  }
  return true;
}

function isPTBTypeArray(value: unknown): value is PTBType[] {
  return isDenseArray(value) && value.every(isPTBType);
}

export function toBuilderGraph(graph: ModelPTBGraph): PTBGraph {
  const nodes: PTBGraph['nodes'] = graph.nodes.map((node) => {
    const base = {
      id: node.id,
      ...(node.label !== undefined ? { label: node.label } : {}),
      ports: node.ports.map((port) => ({ ...port })),
      ...(node.position ? { position: { ...node.position } } : {}),
    };

    if (node.kind === 'Command') {
      const runtime: Record<string, unknown> | undefined = node.params?.runtime
        ? { ...node.params.runtime }
        : undefined;
      const params =
        runtime || node.params?.ui
          ? {
              ...(runtime ? { runtime } : {}),
              ...(node.params?.ui ? { ui: { ...node.params.ui } } : {}),
            }
          : undefined;
      return {
        ...base,
        kind: 'Command',
        command: node.command,
        ...(params ? { params } : {}),
      };
    }

    if (node.kind === 'Variable') {
      return {
        ...base,
        kind: 'Variable',
        name: node.name,
        varType: node.varType,
        ...('value' in node ? { value: node.value } : {}),
        ...(node.rawInput !== undefined ? { rawInput: node.rawInput } : {}),
        ...(node.semantic !== undefined ? { semantic: node.semantic } : {}),
      };
    }

    if (node.kind === 'Start') {
      return { ...base, kind: 'Start' };
    }

    if (node.kind === 'End') {
      return { ...base, kind: 'End' };
    }

    return unsupportedPTBNodeKind(node);
  });

  return {
    nodes,
    edges: graph.edges.map((edge) => ({ ...edge })),
  };
}

function unsupportedPTBNodeKind(node: never): never {
  const kind = (node as { kind?: unknown }).kind;
  throw new Error(`Unsupported PTB node kind: ${String(kind)}`);
}
