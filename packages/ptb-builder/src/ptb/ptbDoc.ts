// src/ptb/ptbDoc.ts
import type {
  SuiMoveNormalizedModules,
  SuiObjectData,
} from '@mysten/sui/client';

import type {
  CommandNode,
  PTBEdge,
  PTBGraph,
  PTBNode,
} from '../ptb/graph/types';
import type { Chain } from '../types';

export const PTB_VERSION = 'ptb_3' as const;

export interface PTBDoc {
  /** File identifier + version */
  version: typeof PTB_VERSION;

  /** Required active chain for this document */
  chain: Chain;

  /** Transaction sender (wallet address or extracted from tx) */
  sender?: string;

  /** PTB graph (required) */
  graph: PTBGraph;

  /** Optional editor viewport state */
  view?: { x: number; y: number; zoom: number };

  /** Optional embeds for offline reproducibility (usually omit) */
  modulesEmbed?: Record<string, SuiMoveNormalizedModules>;
  objectsEmbed?: Record<string, SuiObjectData>;
}

export function isPTBDoc(x: unknown): x is PTBDoc {
  if (!x || typeof x !== 'object') return false;
  const v = (x as any).version;
  const n = (x as any).network;
  const g = (x as any).graph;
  return (
    v === PTB_VERSION &&
    !!n &&
    !!g &&
    Array.isArray(g.nodes) &&
    Array.isArray(g.edges)
  );
}

/** Strip runtime-only bits before saving. */
export function sanitizeGraphForSave(src: PTBGraph): PTBGraph {
  const nodes: PTBNode[] = src.nodes.map((n) => {
    const nn: PTBNode = {
      ...n,
      ports: Array.isArray(n.ports) ? [...n.ports] : [],
    } as PTBNode;
    if (nn.kind === 'Command') {
      const c = nn as CommandNode;
      const prevParams = c.params ?? {};
      const { runtime, ...rest } = prevParams;
      c.params = Object.keys(rest).length ? rest : undefined;
    }
    return nn;
  });
  const edges: PTBEdge[] = src.edges.map((e) => ({ ...e }));
  return { nodes, edges };
}

export function buildDoc(opts: {
  chain: Chain;
  graph: PTBGraph;
  sender?: string;
  view?: { x: number; y: number; zoom: number };
  includeEmbeds?: boolean;
  modules?: Record<string, SuiMoveNormalizedModules>;
  objects?: Record<string, SuiObjectData>;
}): PTBDoc {
  const { chain, graph, sender, view, includeEmbeds, modules, objects } = opts;
  const doc: PTBDoc = {
    version: PTB_VERSION,
    chain,
    sender,
    view,
    graph: sanitizeGraphForSave(graph),
  };
  if (includeEmbeds) {
    if (modules) doc.modulesEmbed = modules;
    if (objects) doc.objectsEmbed = objects;
  }
  return doc;
}

export function parseDoc(json: unknown): PTBDoc {
  if (!isPTBDoc(json)) throw new Error('Invalid PTB document');
  return json;
}
