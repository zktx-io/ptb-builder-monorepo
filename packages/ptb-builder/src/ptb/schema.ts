// Persisted .ptb JSON schema (storage/load).
// Keep this file UI-agnostic and stable across UI changes.

import type { SuiMoveNormalizedModules } from '@mysten/sui/client';

import { Network } from '../types';
import type { PTBGraph } from './graph/types';

export const PTB_VERSION = 'ptb_3' as const;

export interface PTBScheme {
  /** File identifier + version */
  version: typeof PTB_VERSION;

  /** Optional network meta */
  network?: Network;

  /** Transaction sender (wallet address or extracted from tx) */
  sender?: string;

  /** PTB graph (required) */
  graph: PTBGraph;

  /** Optional view state */
  view?: { x: number; y: number; zoom: number };

  /** Optional embedded modules */
  modulesEmbed?: Record<string, SuiMoveNormalizedModules>;
}

export function isPTBScheme(x: unknown): x is PTBScheme {
  if (!x || typeof x !== 'object') return false;
  const v = (x as any).version;
  const g = (x as any).graph;
  return (
    v === PTB_VERSION && !!g && Array.isArray(g.nodes) && Array.isArray(g.edges)
  );
}
