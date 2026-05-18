import { describe, expect, it } from 'vitest';

import type { PTBGraph } from '../src/ptb/graph/types';
import { normalizeGraph } from '../src/ptb/normalizeGraph';
import { KNOWN_IDS } from '../src/ptb/seedGraph';

describe('normalizeGraph', () => {
  it('coalesces Start and End nodes without mutating the input graph', () => {
    const graph: PTBGraph = {
      nodes: [
        {
          id: 'start-local',
          kind: 'Start',
          label: 'Start',
          ports: [{ id: 'next', role: 'flow', direction: 'out' }],
        },
        {
          id: 'end-local',
          kind: 'End',
          label: 'End',
          ports: [{ id: 'prev', role: 'flow', direction: 'in' }],
        },
        {
          id: 'end-duplicate',
          kind: 'End',
          label: 'End duplicate',
          ports: [{ id: 'prev', role: 'flow', direction: 'in' }],
        },
      ],
      edges: [
        {
          id: 'start-end',
          kind: 'flow',
          source: 'start-local',
          sourceHandle: 'local-next',
          target: 'end-local',
          targetHandle: 'local-prev',
        },
        {
          id: 'duplicate-end',
          kind: 'flow',
          source: 'start-local',
          sourceHandle: 'local-next',
          target: 'end-duplicate',
          targetHandle: 'other-prev',
        },
      ],
    };
    const before = JSON.parse(JSON.stringify(graph));
    const normalized = normalizeGraph(graph);

    expect(graph).toEqual(before);
    expect(normalized).not.toBe(graph);
    expect(normalized.nodes[0]).not.toBe(graph.nodes[0]);
    expect(normalized.edges[0]).not.toBe(graph.edges[0]);
    expect(normalized.nodes.map((node) => node.id)).toEqual([
      KNOWN_IDS.START,
      KNOWN_IDS.END,
    ]);
    expect(normalized.edges).toEqual([
      {
        id: 'start-end',
        kind: 'flow',
        source: KNOWN_IDS.START,
        sourceHandle: 'out',
        target: KNOWN_IDS.END,
        targetHandle: 'in',
      },
      {
        id: 'duplicate-end',
        kind: 'flow',
        source: KNOWN_IDS.START,
        sourceHandle: 'out',
        target: KNOWN_IDS.END,
        targetHandle: 'in',
      },
    ]);
  });
});
