import type { PTBDoc } from '@zktx.io/ptb-builder';
import { describe, expect, it } from 'vitest';

import { createPtbUndoHistory } from './ptbUndoHistory';

const graph: PTBDoc['graph'] = {
  nodes: [
    {
      id: '@start',
      kind: 'Start',
      ports: [{ id: 'next', direction: 'out', role: 'flow' }],
    },
    {
      id: '@end',
      kind: 'End',
      ports: [{ id: 'prev', direction: 'in', role: 'flow' }],
    },
  ],
  edges: [
    {
      id: 'flow-start-end',
      kind: 'flow',
      source: '@start',
      sourceHandle: 'next',
      target: '@end',
      targetHandle: 'prev',
    },
  ],
};

function doc(viewX: number): PTBDoc {
  return {
    version: 'ptb_4',
    chain: 'sui:testnet',
    view: { x: viewX, y: 0, zoom: 1 },
    graph,
    modules: {},
    objects: {},
  };
}

function cloneDoc(value: PTBDoc): PTBDoc {
  return JSON.parse(JSON.stringify(value)) as PTBDoc;
}

describe('PTB undo history', () => {
  it('does not create history entries for the same document signature', () => {
    const history = createPtbUndoHistory();
    const first = doc(0);

    history.set(first);
    history.set(cloneDoc(first));

    expect(history.getState().past).toHaveLength(0);
    expect(history.getState().present?.doc).toEqual(first);
    expect(history.undo()).toBeUndefined();
  });

  it('preserves redo when provider echoes the undo document after loadFromDoc', () => {
    const history = createPtbUndoHistory();
    const first = doc(0);
    const second = doc(10);

    history.set(first);
    history.set(second);

    expect(history.undo()).toEqual(first);
    history.set(cloneDoc(first));

    expect(history.getState().future.map((snap) => snap.doc)).toEqual([second]);
    expect(history.redo()).toEqual(second);
  });

  it('clears future when a real edit arrives after undo restoration', () => {
    const history = createPtbUndoHistory();
    const first = doc(0);
    const second = doc(10);
    const edited = doc(20);

    history.set(first);
    history.set(second);
    expect(history.undo()).toEqual(first);
    history.set(cloneDoc(first));
    history.set(edited);

    expect(history.getState().future).toHaveLength(0);
    expect(history.getState().past.map((snap) => snap.doc)).toEqual([first]);
    expect(history.getState().present?.doc).toEqual(edited);
  });

  it('reset clears present, past, future, and pending suppression', () => {
    const history = createPtbUndoHistory();
    const first = doc(0);
    const second = doc(10);

    history.set(first);
    history.set(second);
    expect(history.undo()).toEqual(first);

    history.reset();
    history.set(second);

    expect(history.getState()).toMatchObject({
      past: [],
      present: { doc: second },
      future: [],
    });
    expect(history.undo()).toBeUndefined();
  });
});
