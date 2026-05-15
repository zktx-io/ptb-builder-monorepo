import { PTB_DOC_VERSION_V4 } from '@zktx.io/ptb-model';
import { describe, expect, it } from 'vitest';

import type { PTBGraph } from '../src/ptb/graph/types';
import {
  buildDoc,
  isPTBDoc,
  parseDoc,
  prepareLoadedDoc,
  PTB_VERSION,
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
    expect(isPTBDoc(doc)).toBe(true);
    expect(prepareLoadedDoc(doc)).toMatchObject({
      chain: 'sui:testnet',
      view: { x: 0, y: 0, zoom: 1 },
      modules: {},
      objects: {},
      graph,
    });
  });

  it('rejects legacy ptb_3 documents on the normal runtime path', () => {
    const legacyDoc = {
      version: 'ptb_3',
      chain: 'sui:testnet',
      graph,
    };

    expect(isPTBDoc(legacyDoc)).toBe(false);
    expect(() => parseDoc(legacyDoc)).toThrow(
      'PTB document version must be ptb_4',
    );
    expect(() => prepareLoadedDoc(legacyDoc)).toThrow(
      'PTB document version must be ptb_4',
    );
  });

  it('rejects current documents with missing or unsupported chains before load', () => {
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
    expect(
      isPTBDoc({
        version: 'ptb_4',
        chain: 'sui:mainnet',
        graph,
        view: { x: 5, y: 10, zoom: 1.25 },
        modules: invalidTypedModules,
        objects: {},
      }),
    ).toBe(false);
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
