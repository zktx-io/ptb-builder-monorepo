// src/ptb/portTemplates.ts
import type { Port, PTBType } from './graph/types';

/** -------- Flow helpers (no command-specific IO here) -------- */
const flowIn = (id = 'prev'): Port => ({ id, direction: 'in', role: 'flow' });
const flowOut = (id = 'next'): Port => ({ id, direction: 'out', role: 'flow' });

/** Default unknown type (placeholder) */
const UNKNOWN: PTBType = { kind: 'unknown' };

/** -------- IO helpers (reusable outside this file) -------- */
export const ioIn = (id: string, dataType?: PTBType): Port => ({
  id,
  direction: 'in',
  role: 'io',
  dataType,
});
export const ioOut = (id: string, dataType?: PTBType): Port => ({
  id,
  direction: 'out',
  role: 'io',
  dataType,
});

/** -------- Standard Port Sets -------- */
export const PORTS = {
  /** Start node: flow → next */
  start(): Port[] {
    return [flowOut('next')];
  },

  /** End node: flow ← prev */
  end(): Port[] {
    return [flowIn('prev')];
  },

  /** Command base: only flow prev/next (IO ports come from registry!) */
  commandBase(): Port[] {
    return [flowIn('prev'), flowOut('next')];
  },

  /** Variable out: single out port with optional type */
  variableOut(dataType?: PTBType): Port[] {
    return [
      {
        id: 'out',
        direction: 'out',
        role: 'io',
        dataType: dataType ?? UNKNOWN,
      },
    ];
  },
} as const;
