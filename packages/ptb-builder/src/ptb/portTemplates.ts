// src/ptb/portTemplates.ts
import type { Port, PTBType } from './graph/types';

export const FLOW_PREV = 'prev' as const;
export const FLOW_NEXT = 'next' as const;
export const VAR_IN = 'in' as const;
export const VAR_OUT = 'out' as const;

/** UI-friendly options for building a Port */
export type PortOptions = {
  /** Optional PTBType carried by the port (IO only) */
  dataType?: PTBType;
  /** Optional pre-serialized type hint (IO only, overrides dataType serialization if provided) */
  typeStr?: string;
  /** Optional handle label shown next to the port */
  label?: string;
};

/** Type guard */
function isPTBType(x: unknown): x is PTBType {
  return !!x && typeof x === 'object' && 'kind' in (x as any);
}

/** Merge a PTBType or a PortOptions into a PortOptions object */
function normalizeOptions(arg?: PTBType | PortOptions): PortOptions {
  if (!arg) return {};
  return isPTBType(arg) ? { dataType: arg } : (arg as PortOptions);
}

/** Flow ports never carry IO typing; keep only label if provided */
// NOTE:
// Flow handles must not carry any IO typing. Types/coloring only applies
// to IO handles. We intentionally drop both `dataType` and `typeStr` here.
function flowOptsOnlyLabel(opts?: PortOptions): Pick<PortOptions, 'label'> {
  return opts?.label ? { label: opts.label } : {};
}

/** -------- Flow helpers -------- */
export const flowIn = (id = FLOW_PREV, opts?: PortOptions): Port => ({
  id,
  direction: 'in',
  role: 'flow',
  ...flowOptsOnlyLabel(normalizeOptions(opts)),
});

export const flowOut = (id = FLOW_NEXT, opts?: PortOptions): Port => ({
  id,
  direction: 'out',
  role: 'flow',
  ...flowOptsOnlyLabel(normalizeOptions(opts)),
});

/** -------- IO helpers -------- */
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

/** Default unknown type (placeholder) */
export const UNKNOWN: PTBType = { kind: 'unknown' };

/** -------- Standard Port Sets -------- */
export const PORTS = {
  /** Start node: flow → next */
  start(): Port[] {
    return [flowOut(FLOW_NEXT)];
  },

  /** End node: flow ← prev */
  end(): Port[] {
    return [flowIn(FLOW_PREV)];
  },

  /** Command base: only flow prev/next (IO ports come from registry) */
  commandBase(): Port[] {
    return [flowIn(FLOW_PREV), flowOut(FLOW_NEXT)];
  },
} as const;
