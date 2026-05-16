import { describe, expect, it } from 'vitest';

import type { PTBGraph } from '../src/ptb/graph/types';
import { stableGraphSig } from '../src/ui/graphSignature';

const OBJECT_ID =
  '0x0000000000000000000000000000000000000000000000000000000000000001';
const DIGEST = '5J7c3KXyQ9nEw2z4V5m8b1aC6dF7gH8iJ9kL0mN1oP2q';

function graphWithRawInput(rawInput: unknown): PTBGraph {
  return {
    nodes: [
      {
        id: 'object',
        kind: 'Variable',
        name: 'object',
        varType: { kind: 'object', typeTag: '0x2::coin::Coin<0x2::sui::SUI>' },
        value: OBJECT_ID,
        rawInput: rawInput as any,
        ports: [{ id: 'out', direction: 'out', role: 'io' }],
      },
    ],
    edges: [],
  };
}

describe('graph semantic signature', () => {
  it('treats raw object usage as graph semantics', () => {
    const objectRef = graphWithRawInput({
      kind: 'Object',
      object: {
        kind: 'ImmOrOwnedObject',
        objectId: OBJECT_ID,
        version: '7',
        digest: DIGEST,
      },
    });
    const receiving = graphWithRawInput({
      kind: 'Object',
      object: {
        kind: 'Receiving',
        objectId: OBJECT_ID,
        version: '7',
        digest: DIGEST,
      },
    });

    expect(stableGraphSig(objectRef)).not.toBe(stableGraphSig(receiving));
  });

  it('treats shared object mutability as graph semantics', () => {
    const readonly = graphWithRawInput({
      kind: 'Object',
      object: {
        kind: 'SharedObject',
        objectId: OBJECT_ID,
        initialSharedVersion: '3',
        mutable: false,
      },
    });
    const mutable = graphWithRawInput({
      kind: 'Object',
      object: {
        kind: 'SharedObject',
        objectId: OBJECT_ID,
        initialSharedVersion: '3',
        mutable: true,
      },
    });

    expect(stableGraphSig(readonly)).not.toBe(stableGraphSig(mutable));
  });

  it('treats edge casts as graph semantics', () => {
    const withoutCast: PTBGraph = {
      nodes: [],
      edges: [
        {
          id: 'edge-cast',
          kind: 'io',
          source: 'source',
          sourceHandle: 'out',
          target: 'target',
          targetHandle: 'in',
        },
      ],
    };
    const withCast: PTBGraph = {
      nodes: [],
      edges: [
        {
          ...withoutCast.edges[0],
          cast: { to: 'u64' },
        },
      ],
    };

    expect(stableGraphSig(withoutCast)).not.toBe(stableGraphSig(withCast));
  });
});
