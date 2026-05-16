import { PTB_DOC_VERSION_V4 } from '@zktx.io/ptb-model';
import { describe, expect, it } from 'vitest';

import type { PTBGraph } from '../src/ptb/graph/types';
import {
  buildDoc,
  createEmptyPTBDoc,
  parseDoc,
  prepareLoadedDoc,
  PTB_VERSION,
  stablePTBDocSignature,
} from '../src/ptb/ptbDoc';

const graph: PTBGraph = {
  nodes: [],
  edges: [],
};

describe('PTB document boundary', () => {
  it('builds and parses only current ptb_4 documents', () => {
    const doc = buildDoc({
      chain: 'sui:testnet',
      graph,
      view: { x: 0, y: 0, zoom: 1 },
      modules: {},
      objects: {},
    });

    expect(PTB_VERSION).toBe(PTB_DOC_VERSION_V4);
    expect(doc.version).toBe('ptb_4');
    expect(parseDoc(doc)).toBe(doc);
    expect(prepareLoadedDoc(doc)).toMatchObject({
      chain: 'sui:testnet',
      view: { x: 0, y: 0, zoom: 1 },
      modules: {},
      objects: {},
      graph,
    });
  });

  it('creates a canonical empty document for loadFromDoc(chain)', () => {
    const doc = createEmptyPTBDoc('sui:testnet');
    const loaded = prepareLoadedDoc(doc);

    expect(doc.version).toBe('ptb_4');
    expect(doc.chain).toBe('sui:testnet');
    expect(doc.view).toEqual({ x: 0, y: 0, zoom: 1 });
    expect(doc.modules).toEqual({});
    expect(doc.objects).toEqual({});
    expect(loaded.graph.nodes.map((node) => node.id)).toEqual([
      '@start',
      '@end',
    ]);
    expect(loaded.graph.edges).toEqual([
      {
        id: 'flow-start-end',
        kind: 'flow',
        source: '@start',
        sourceHandle: 'next',
        target: '@end',
        targetHandle: 'prev',
      },
    ]);
    expect(stablePTBDocSignature(parseDoc(doc))).toBe(
      stablePTBDocSignature(doc),
    );
  });

  it('normalizes missing document embeds to required empty maps', () => {
    const omitted = parseDoc({
      version: 'ptb_4',
      chain: 'sui:testnet',
      graph,
      view: { x: 0, y: 0, zoom: 1 },
    });
    const explicit = parseDoc({
      version: 'ptb_4',
      chain: 'sui:testnet',
      graph,
      view: { x: 0, y: 0, zoom: 1 },
      modules: {},
      objects: {},
    });

    expect(omitted.modules).toEqual({});
    expect(omitted.objects).toEqual({});
    expect(stablePTBDocSignature(omitted)).toBe(
      stablePTBDocSignature(explicit),
    );
  });

  it('rejects unsupported ptb_3 documents on the normal runtime path', () => {
    const unsupportedDoc = {
      version: 'ptb_3',
      chain: 'sui:testnet',
      graph,
    };

    expect(() => parseDoc(unsupportedDoc)).toThrow(
      'PTB document version must be ptb_4',
    );
    expect(() => prepareLoadedDoc(unsupportedDoc)).toThrow(
      'PTB document version must be ptb_4',
    );
  });

  it('rejects ptb_4 documents with missing or unsupported chains before load', () => {
    expect(() =>
      prepareLoadedDoc({
        version: 'ptb_4',
        view: { x: 0, y: 0, zoom: 1 },
        graph,
        modules: {},
        objects: {},
      }),
    ).toThrow('Invalid or missing chain in PTB document');
    expect(() =>
      prepareLoadedDoc({
        version: 'ptb_4',
        chain: 'sui:localnet',
        view: { x: 0, y: 0, zoom: 1 },
        graph,
        modules: {},
        objects: {},
      }),
    ).toThrow('Invalid or missing chain in PTB document');
    expect(() =>
      prepareLoadedDoc({
        version: 'ptb_4',
        chain: 'sui:mainnet',
        graph,
        modules: {},
        objects: {},
      }),
    ).toThrow('Invalid or missing view in PTB document');
  });

  it('round-trips current documents with builder embed metadata', () => {
    const modules = {
      '0x2': {
        coin: {
          value: {
            tparamCount: 0,
            ins: [{ kind: 'scalar', name: 'address' }],
            outs: [],
          },
        },
      },
    } satisfies NonNullable<ReturnType<typeof buildDoc>['modules']>;
    const objects = {
      '0x1': {
        objectId: '0x1',
        typeTag: '0x2::coin::Coin<0x2::sui::SUI>',
      },
    } satisfies NonNullable<ReturnType<typeof buildDoc>['objects']>;

    const doc = buildDoc({
      chain: 'sui:mainnet',
      graph,
      view: { x: 5, y: 10, zoom: 1.25 },
      modules,
      objects,
    });

    expect(parseDoc(doc)).toBe(doc);
    expect(
      buildDoc({
        chain: doc.chain as 'sui:mainnet',
        graph,
        view: doc.view!,
        modules: doc.modules,
        objects: doc.objects,
      }),
    ).toEqual(doc);
  });

  it('preserves current ptb_4 semantics across edit/export/reload', () => {
    const loaded = prepareLoadedDoc(createEmptyPTBDoc('sui:mainnet'));
    const editedGraph: PTBGraph = {
      nodes: [
        ...loaded.graph.nodes,
        {
          id: 'amount',
          kind: 'Variable',
          label: 'amount',
          name: 'amount',
          varType: { kind: 'move_numeric', width: 'u64' },
          value: '100',
          ports: [
            {
              id: 'out',
              direction: 'out',
              role: 'io',
              dataType: { kind: 'move_numeric', width: 'u64' },
            },
          ],
        },
      ],
      edges: loaded.graph.edges,
    };

    const exported = buildDoc({
      chain: loaded.chain,
      graph: editedGraph,
      view: loaded.view,
      modules: loaded.modules,
      objects: loaded.objects,
    });
    const reloaded = prepareLoadedDoc(exported);

    expect(reloaded.chain).toBe('sui:mainnet');
    expect(reloaded.view).toEqual(loaded.view);
    expect(reloaded.graph).toEqual(editedGraph);
    expect(reloaded.modules).toEqual({});
    expect(reloaded.objects).toEqual({});
  });

  it('creates stable document signatures independent of object key order', () => {
    const first = buildDoc({
      chain: 'sui:mainnet',
      graph,
      view: { x: 5, y: 10, zoom: 1.25 },
      modules: {
        '0xb': {},
        '0xa': {},
      },
      objects: {
        '0x2': {
          objectId: '0x2',
          typeTag: '0x2::coin::Coin<0x2::sui::SUI>',
        },
        '0x1': {
          objectId: '0x1',
          typeTag: '0x2::sui::SUI',
        },
      },
    });
    const second = buildDoc({
      chain: 'sui:mainnet',
      graph,
      view: { x: 5, y: 10, zoom: 1.25 },
      modules: {
        '0xa': {},
        '0xb': {},
      },
      objects: {
        '0x1': {
          objectId: '0x1',
          typeTag: '0x2::sui::SUI',
        },
        '0x2': {
          objectId: '0x2',
          typeTag: '0x2::coin::Coin<0x2::sui::SUI>',
        },
      },
    });

    expect(stablePTBDocSignature(first)).toBe(stablePTBDocSignature(second));
  });

  it('uses canonical view keys only for document signatures', () => {
    const first = buildDoc({
      chain: 'sui:mainnet',
      graph,
      view: { x: 12.3451, y: -4.0049, zoom: 1.00004 },
      modules: {},
      objects: {},
    });
    const second = buildDoc({
      chain: 'sui:mainnet',
      graph,
      view: { x: 12.3452, y: -4.0048, zoom: 1.000049 },
      modules: {},
      objects: {},
    });

    expect(first.view).not.toEqual(second.view);
    expect(stablePTBDocSignature(first)).toMatch(/^ptb-doc-sig-v2:/);
    expect(stablePTBDocSignature(first)).toBe(stablePTBDocSignature(second));
  });

  it('rejects invalid embedded metadata instead of silently dropping it', () => {
    const invalidModules = {
      '0x2': { coin: { SUI: { tparamCount: 'bad' } } },
    };
    const invalidTypedModules = {
      '0x2': { coin: { SUI: { tparamCount: 0, ins: ['bad'], outs: [] } } },
    };
    const invalidCountModules = {
      '0x2': {
        coin: {
          SUI: {
            tparamCount: Number.NaN,
            ins: [],
            outs: [],
          },
        },
      },
    };
    const extraFieldModules = {
      '0x2': {
        coin: {
          SUI: {
            tparamCount: 0,
            ins: [],
            outs: [],
            visibility: 'public',
          },
        },
      },
    };
    const invalidObjects = {
      '0x1': { objectId: 1, typeTag: 'not enough' },
    };
    const extraFieldObjects = {
      '0x1': {
        objectId: '0x1',
        typeTag: '0x2::coin::Coin<0x2::sui::SUI>',
        version: '1',
      },
    };

    expect(() =>
      buildDoc({
        chain: 'sui:mainnet',
        graph,
        view: { x: 5, y: 10, zoom: 1.25 },
        modules: invalidModules,
        objects: {},
      }),
    ).toThrow('PTB document modules must match the PTB modules embed shape');
    expect(() =>
      buildDoc({
        chain: 'sui:mainnet',
        graph,
        view: { x: 5, y: 10, zoom: 1.25 },
        modules: invalidTypedModules,
        objects: {},
      }),
    ).toThrow('PTB document modules must match the PTB modules embed shape');
    expect(() =>
      buildDoc({
        chain: 'sui:mainnet',
        graph,
        view: { x: 5, y: 10, zoom: 1.25 },
        modules: invalidCountModules,
        objects: {},
      }),
    ).toThrow('PTB document modules must match the PTB modules embed shape');
    expect(() =>
      buildDoc({
        chain: 'sui:mainnet',
        graph,
        view: { x: 5, y: 10, zoom: 1.25 },
        modules: extraFieldModules,
        objects: {},
      }),
    ).toThrow('PTB document modules must match the PTB modules embed shape');
    expect(() =>
      buildDoc({
        chain: 'sui:mainnet',
        graph,
        view: { x: 5, y: 10, zoom: 1.25 },
        modules: {},
        objects: invalidObjects,
      }),
    ).toThrow('PTB document objects must match the PTB objects embed shape');
    expect(() =>
      buildDoc({
        chain: 'sui:mainnet',
        graph,
        view: { x: 5, y: 10, zoom: 1.25 },
        modules: {},
        objects: extraFieldObjects,
      }),
    ).toThrow('PTB document objects must match the PTB objects embed shape');
    expect(() =>
      parseDoc({
        version: 'ptb_4',
        chain: 'sui:mainnet',
        view: { x: 5, y: 10, zoom: 1.25 },
        graph,
        modules: { '0x2': { coin: { SUI: { tparamCount: 'bad' } } } },
      }),
    ).toThrow('PTB document modules must match the PTB modules embed shape');
  });
});
