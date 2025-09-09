// src/ptb/seedGraph.ts

// -----------------------------------------------------------------------------
// Default seeded graph and well-known ids used by the canvas.
// - Positions are editor-friendly defaults only (not part of the data model).
// - START/END ids are canonical; provider normalizes duplicates onto these ids.
// -----------------------------------------------------------------------------

import { PTBGraph } from './graph/types';
import { PORTS } from './portTemplates';

export const KNOWN_IDS = {
  START: '@start',
  END: '@end',
  GAS: '@gas',
  SYSTEM: '@system',
  CLOCK: '@clock',
  RANDOM: '@random',
  MY_WALLET: '@my_wallet',
} as const;

export type WellKnownId = (typeof KNOWN_IDS)[keyof typeof KNOWN_IDS];

export function isWellKnownId(id?: string): id is WellKnownId {
  return !!id && Object.values(KNOWN_IDS).includes(id as WellKnownId);
}

export function seedDefaultGraph(): PTBGraph {
  return {
    nodes: [
      {
        id: KNOWN_IDS.START,
        kind: 'Start',
        label: 'Start',
        position: { x: 160, y: 325 },
        ports: PORTS.start(),
      },
      {
        id: KNOWN_IDS.END,
        kind: 'End',
        label: 'End',
        position: { x: 640, y: 325 },
        ports: PORTS.end(),
      },
    ],
    edges: [],
  };
}
