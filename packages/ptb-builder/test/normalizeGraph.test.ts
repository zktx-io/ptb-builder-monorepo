import { describe, expect, it } from 'vitest';

import type { PTBGraph } from '../src/ptb/graph/types';
import {
  applyGraphNodePositions,
  normalizeGraph,
} from '../src/ptb/normalizeGraph';
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

  it('applies layout positions without changing graph semantics', () => {
    const graph: PTBGraph = {
      nodes: [
        {
          id: 'start',
          kind: 'Start',
          ports: [{ id: 'out', role: 'flow', direction: 'out' }],
          position: { x: 0, y: 0 },
        },
        {
          id: 'cmd',
          kind: 'Command',
          command: 'transferObjects',
          params: { runtime: { resultCount: 0 } },
          ports: [
            { id: 'in', role: 'flow', direction: 'in' },
            { id: 'out', role: 'flow', direction: 'out' },
          ],
          position: { x: 1, y: 2 },
        },
        {
          id: 'end',
          kind: 'End',
          ports: [{ id: 'in', role: 'flow', direction: 'in' }],
        },
      ],
      edges: [
        {
          id: 'flow-start-cmd',
          kind: 'flow',
          source: 'start',
          sourceHandle: 'out',
          target: 'cmd',
          targetHandle: 'in',
        },
      ],
    };
    const before = JSON.parse(JSON.stringify(graph));

    const next = applyGraphNodePositions(graph, {
      cmd: { x: 10, y: 20 },
      missing: { x: 99, y: 99 },
      end: { x: Number.NaN, y: 30 },
    });

    expect(graph).toEqual(before);
    expect(next).not.toBe(graph);
    expect(next.edges).toBe(graph.edges);
    expect(next.nodes[0]).toBe(graph.nodes[0]);
    expect(next.nodes[2]).toBe(graph.nodes[2]);
    expect(next.nodes[1]).toEqual({
      ...graph.nodes[1],
      position: { x: 10, y: 20 },
    });
    expect(
      next.nodes.find((node) => node.id === 'cmd' && node.kind === 'Command')
        ?.params,
    ).toBe(
      graph.nodes.find((node) => node.id === 'cmd' && node.kind === 'Command')
        ?.params,
    );
  });

  it('returns the same graph when layout positions do not change nodes', () => {
    const graph: PTBGraph = {
      nodes: [
        {
          id: 'start',
          kind: 'Start',
          ports: [{ id: 'out', role: 'flow', direction: 'out' }],
          position: { x: 1, y: 2 },
        },
      ],
      edges: [],
    };

    expect(
      applyGraphNodePositions(graph, {
        start: { x: 1, y: 2 },
        missing: { x: 3, y: 4 },
      }),
    ).toBe(graph);
  });
});
