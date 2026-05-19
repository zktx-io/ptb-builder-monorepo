// src/ptb/ptbDoc.ts

// -----------------------------------------------------------------------------
// PTB document model (self-contained; no Sui runtime types).
// - Embeds (modules/objects) are normalized to PTB shapes for offline replay.
// - The document captures only what PTB needs to reconstruct/preview a graph.
// -----------------------------------------------------------------------------

import {
  isPTBType,
  isRawOpenSignatureList,
  parsePTBDocV4,
  PTB_DOC_VERSION_V4,
} from '@zktx.io/ptb-model';
import type { PTBDocV4, RawOpenSignature } from '@zktx.io/ptb-model';

import { isSuiChain } from '../types';
import type { Chain } from '../types';
import type { PTBGraph, PTBType } from './graph/types';
import { seedDefaultGraph } from './seedGraph';

export type PTBView = { x: number; y: number; zoom: number };
export const DEFAULT_PTB_VIEW: PTBView = Object.freeze({
  x: 0,
  y: 0,
  zoom: 1,
});
const PTB_DOC_SIGNATURE_PREFIX = 'ptb-doc-sig-v2:';

// ----- version ---------------------------------------------------------------

export const PTB_VERSION = PTB_DOC_VERSION_V4;

// ----- normalized ABI --------------------------------------------------------

export type PTBFunctionOpenSignatures = {
  parameters: RawOpenSignature[];
  returns: RawOpenSignature[];
};

/**
 * Normalized function table for a single module.
 * key: function name → { tparamCount, ins, outs, openSignatures }
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
    /** Open SDK signatures retained so generic MoveCall ports can be recomputed after reload. */
    openSignatures: PTBFunctionOpenSignatures;
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
  modules: PTBModulesEmbed;
  objects: PTBObjectsEmbed;
};
export type LoadedPTBDocState = {
  doc: PTBDoc;
  chain: Chain;
  view: PTBView;
  modules: PTBModulesEmbed;
  objects: PTBObjectsEmbed;
  graph: PTBGraph;
};

// ----- validation (strict ptb_4 document shape) ------------------------------

const PTB_FUNCTION_ENTRY_KEYS = [
  'tparamCount',
  'ins',
  'outs',
  'openSignatures',
] as const;
const PTB_FUNCTION_OPEN_SIGNATURES_KEYS = ['parameters', 'returns'] as const;
const PTB_OBJECT_DATA_KEYS = ['objectId', 'typeTag'] as const;

/** Narrow check for PTBFunctionData entry. */
function isPTBFunctionEntry(x: unknown): x is {
  tparamCount: number;
  ins: PTBType[];
  outs: PTBType[];
  openSignatures: PTBFunctionOpenSignatures;
} {
  if (!x || typeof x !== 'object' || Array.isArray(x)) return false;
  const e = x as any;
  return (
    hasOnlyKeys(e, PTB_FUNCTION_ENTRY_KEYS) &&
    Number.isInteger(e.tparamCount) &&
    e.tparamCount >= 0 &&
    isPTBTypeArray(e.ins) &&
    isPTBTypeArray(e.outs) &&
    isPTBFunctionOpenSignatures(e.openSignatures)
  );
}

function isPTBFunctionOpenSignatures(
  value: unknown,
): value is PTBFunctionOpenSignatures {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const signatures = value as Record<string, unknown>;
  return (
    hasOnlyKeys(signatures, PTB_FUNCTION_OPEN_SIGNATURES_KEYS) &&
    isRawOpenSignatureList(signatures.parameters) &&
    isRawOpenSignatureList(signatures.returns)
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
function isPTBModulesEmbed(x: unknown): x is PTBModulesEmbed {
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
function isPTBObjectsEmbed(x: unknown): x is PTBObjectsEmbed {
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
    view,
    graph,
    modules,
    objects,
    ...(sender !== undefined ? { sender } : {}),
  };

  return parseDoc(doc);
}

export function createEmptyPTBDoc(chain: Chain): PTBDoc {
  return buildDoc({
    chain,
    graph: seedDefaultGraph(),
    view: { ...DEFAULT_PTB_VIEW },
    modules: {},
    objects: {},
  });
}

/** Parse and validate a JSON object into PTBDoc. */
export function parseDoc(json: unknown): PTBDoc {
  const doc = parsePTBDocV4(json);
  const chain = parseDocChain(doc.chain);
  if (!chain) {
    throw new Error('Invalid or missing chain in PTB document.');
  }
  if (!doc.view) {
    throw new Error('Invalid or missing view in PTB document.');
  }
  const modules = requirePTBModulesEmbed(doc.modules ?? {});
  const objects = requirePTBObjectsEmbed(doc.objects ?? {});
  if (doc.modules === modules && doc.objects === objects) {
    return doc as PTBDoc;
  }
  return { ...doc, modules, objects } as PTBDoc;
}

export function prepareLoadedDoc(value: unknown): LoadedPTBDocState {
  const doc = parseDoc(value);

  return {
    doc,
    chain: doc.chain,
    view: doc.view,
    modules: doc.modules,
    objects: doc.objects,
    graph: doc.graph,
  };
}

export function stablePTBDocSignature(doc: PTBDoc): string {
  return `${PTB_DOC_SIGNATURE_PREFIX}${stableStringify({
    version: doc.version,
    chain: doc.chain,
    sender: doc.sender,
    view: canonicalPTBViewKey(doc.view),
    graph: doc.graph,
    modules: doc.modules,
    objects: doc.objects,
  })}`;
}

export function canonicalPTBViewKey(view: PTBView): PTBView {
  return {
    x: roundViewNumber(view.x, 2),
    y: roundViewNumber(view.y, 2),
    zoom: roundViewNumber(view.zoom, 4),
  };
}

export function hasSameCanonicalPTBView(a: PTBView, b: PTBView): boolean {
  const left = canonicalPTBViewKey(a);
  const right = canonicalPTBViewKey(b);
  return left.x === right.x && left.y === right.y && left.zoom === right.zoom;
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
  return isSuiChain(value) ? value : undefined;
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

function roundViewNumber(value: number, decimals: number): number {
  if (!Number.isFinite(value)) return value;
  const scale = 10 ** decimals;
  const rounded = Math.round(value * scale) / scale;
  return Object.is(rounded, -0) ? 0 : rounded;
}

function isPTBTypeArray(value: unknown): value is PTBType[] {
  return isDenseArray(value) && value.every(isPTBType);
}

export function stableStringify(value: unknown): string {
  return JSON.stringify(value, (_, item) => {
    if (typeof item === 'bigint') return item.toString();
    if (item && typeof item === 'object' && !Array.isArray(item)) {
      return Object.keys(item)
        .sort()
        .reduce<Record<string, unknown>>((acc, key) => {
          acc[key] = (item as Record<string, unknown>)[key];
          return acc;
        }, {});
    }
    return item;
  });
}
