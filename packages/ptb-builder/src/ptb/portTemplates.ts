import type { Port, PTBType } from './graph/types';

// Small helpers to avoid typos and keep intent explicit
const flowIn = (id = 'prev'): Port => ({ id, direction: 'in', role: 'flow' });
const flowOut = (id = 'next'): Port => ({ id, direction: 'out', role: 'flow' });
const ioIn = (id: string, dataType?: PTBType): Port => ({
  id,
  direction: 'in',
  role: 'io',
  dataType,
});
const ioOut = (id: string, dataType?: PTBType): Port => ({
  id,
  direction: 'out',
  role: 'io',
  dataType,
});

const UNKNOWN: PTBType = { kind: 'unknown' };

export const PORTS = {
  start(): Port[] {
    return [flowOut('next')];
  },
  end(): Port[] {
    return [flowIn('prev')];
  },
  commandBase(): Port[] {
    return [flowIn('prev'), flowOut('next')];
  },
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
  commandInput(id: string, dataType?: PTBType): Port {
    return { id, direction: 'in', role: 'io', dataType: dataType ?? UNKNOWN };
  },

  // --- Examples: expand per-command IO as you wire them ---
  // SplitCoins: flow prev/next + inputs: coin, amounts[]; outputs: coins[]
  splitCoinsIO(): Port[] {
    return [
      flowIn('prev'),
      flowOut('next'),
      ioIn('in_coin', { kind: 'object', name: 'coin' }),
      ioIn('in_amounts', {
        kind: 'vector',
        elem: { kind: 'scalar', name: 'number' },
      }),
      ioOut('out_coins', {
        kind: 'vector',
        elem: { kind: 'object', name: 'coin' },
      }),
    ];
  },

  // MergeCoins: coin + coins[] -> coin
  mergeCoinsIO(): Port[] {
    return [
      flowIn('prev'),
      flowOut('next'),
      ioIn('in_coin', { kind: 'object', name: 'coin' }),
      ioIn('in_list', {
        kind: 'vector',
        elem: { kind: 'object', name: 'coin' },
      }),
      ioOut('out_coin', { kind: 'object', name: 'coin' }),
    ];
  },
  moveCallIO: (rets?: PTBType) => {
    const base = [flowIn('prev'), flowOut('next')];
    if (!rets) return base.concat(ioOut('out', UNKNOWN) as any);

    if (rets.kind === 'tuple') {
      const outs = [
        ioOut('out', rets),
        ...rets.elems.map((t, i) => ioOut(`out_${i}`, t)),
      ];
      return base.concat(outs);
    }
    return base.concat(ioOut('out', rets));
  },
} as const;
