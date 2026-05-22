import { describe, expect, it } from 'vitest';

import type { PTBGraph } from '../src/ptb/graph/types';
import {
  createEditorSessionHistory,
  createEditorSessionSnapshot,
} from '../src/ui/editorSessionHistory';

const chain = 'sui:testnet' as const;

function graphWithNode(id: string): PTBGraph {
  return {
    nodes: [
      { id: 'start', kind: 'Start', position: { x: 0, y: 0 } },
      { id, kind: 'Variable', position: { x: 120, y: 0 }, varType: 'vector' },
      { id: 'end', kind: 'End', position: { x: 240, y: 0 } },
    ],
    edges: [],
  } as PTBGraph;
}

function emptyGraph(): PTBGraph {
  return {
    nodes: [
      { id: 'start', kind: 'Start', position: { x: 0, y: 0 } },
      { id: 'end', kind: 'End', position: { x: 240, y: 0 } },
    ],
    edges: [],
  } as PTBGraph;
}

function snapshot(id: string) {
  return createEditorSessionSnapshot({
    chain,
    graph: graphWithNode(id),
    modules: {},
    objects: {},
  });
}

describe('editor session history', () => {
  it('tracks graph snapshots without requiring PTBDoc exportability', () => {
    const history = createEditorSessionHistory();
    history.reset(
      createEditorSessionSnapshot({
        chain,
        graph: emptyGraph(),
        modules: {},
        objects: {},
      }),
    );
    history.record(snapshot('good-node'));
    history.record(snapshot('problem-vector-node'));

    expect(history.canUndo()).toBe(true);

    const undo = history.beginUndo();
    expect(
      undo?.snapshot.graph.nodes.some((node) => node.id === 'good-node'),
    ).toBe(true);
    undo?.commit();

    expect(history.canRedo()).toBe(true);
    const redo = history.beginRedo();
    expect(
      redo?.snapshot.graph.nodes.some(
        (node) => node.id === 'problem-vector-node',
      ),
    ).toBe(true);
  });

  it('does not create undo entries for embedded metadata replacement of present', () => {
    const history = createEditorSessionHistory();
    history.reset(snapshot('a'));
    history.replacePresent(
      createEditorSessionSnapshot({
        chain,
        graph: graphWithNode('a'),
        modules: {},
        objects: {
          '0x2': {
            objectId: '0x2',
            typeTag: '0x2::sui::SUI',
          },
        },
      }),
    );

    expect(history.canUndo()).toBe(false);
    expect(history.getState().present?.objects).toEqual({
      '0x2': {
        objectId: '0x2',
        typeTag: '0x2::sui::SUI',
      },
    });
  });

  it('rolls back the history stack when a restore transaction is cancelled', () => {
    const history = createEditorSessionHistory();
    history.reset(snapshot('a'));
    history.record(snapshot('b'));

    const undo = history.beginUndo();
    expect(undo).toBeDefined();
    undo?.cancel();

    expect(
      history.getState().present?.graph.nodes.some((node) => node.id === 'b'),
    ).toBe(true);
    expect(history.canRedo()).toBe(false);
  });

  it('does not expose mutable stored snapshots', () => {
    const history = createEditorSessionHistory();
    history.reset(snapshot('a'));

    const state = history.getState();
    state.present?.graph.nodes.push({
      id: 'mutated',
      kind: 'End',
      position: { x: 0, y: 0 },
    } as never);

    expect(
      history
        .getState()
        .present?.graph.nodes.some((node) => node.id === 'mutated'),
    ).toBe(false);
  });
});
