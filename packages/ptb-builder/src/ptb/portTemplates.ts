// src/ptb/portTemplates.ts
import type { Port, PTBType } from './graph/types';

/** Options for building a Port (UI-friendly) */
export type PortOptions = {
  /** Optional type carried by the port */
  dataType?: PTBType;
  /** Optional pre-serialized type hint (overrides dataType serialization if provided) */
  typeStr?: string;
  /** Optional handle label shown next to the port */
  label?: string;
};

/** Merge a PTBType or a PortOptions into a PortOptions object */
function normalizeOptions(arg?: PTBType | PortOptions): PortOptions {
  if (!arg) return {};
  // If it looks like a PTBType (has 'kind'), treat as dataType
  if (typeof arg === 'object' && 'kind' in arg) {
    return { dataType: arg as PTBType };
  }
  return arg as PortOptions;
}

/** -------- Flow helpers (no command-specific IO here) -------- */
export const flowIn = (id = 'prev', opts?: PortOptions): Port => ({
  id,
  direction: 'in',
  role: 'flow',
  ...normalizeOptions(opts),
});

export const flowOut = (id = 'next', opts?: PortOptions): Port => ({
  id,
  direction: 'out',
  role: 'flow',
  ...normalizeOptions(opts),
});

/** -------- IO helpers (reusable outside this file) -------- */
export const ioIn = (id: string, opts?: PTBType | PortOptions): Port => ({
  id,
  direction: 'in',
  role: 'io',
  ...normalizeOptions(opts),
});

export const ioOut = (id: string, opts?: PTBType | PortOptions): Port => ({
  id,
  direction: 'out',
  role: 'io',
  ...normalizeOptions(opts),
});

/** -------- Default unknown type (placeholder) -------- */
export const UNKNOWN: PTBType = { kind: 'unknown' };

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
  variableOut(opts?: PTBType | PortOptions): Port[] {
    return [
      ioOut('out', {
        dataType: UNKNOWN,
        ...normalizeOptions(opts),
      }),
    ];
  },
} as const;
