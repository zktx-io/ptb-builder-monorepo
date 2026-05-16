import { type PTBDoc, stablePTBDocSignature } from '@zktx.io/ptb-builder';

export type PtbUndoSnapshot = { doc: PTBDoc; sig: string };

export type PtbUndoHistoryState = {
  past: PtbUndoSnapshot[];
  present: PtbUndoSnapshot | undefined;
  future: PtbUndoSnapshot[];
};

export type PtbUndoHistory = {
  reset: () => void;
  set: (doc: PTBDoc) => void;
  undo: () => PTBDoc | undefined;
  redo: () => PTBDoc | undefined;
  getState: () => PtbUndoHistoryState;
};

export function createPtbUndoHistory(): PtbUndoHistory {
  let state: PtbUndoHistoryState = emptyState();
  let suppressNext = false;

  const snapshot = (doc: PTBDoc): PtbUndoSnapshot => ({
    doc,
    sig: stablePTBDocSignature(doc),
  });

  return {
    reset() {
      state = emptyState();
      suppressNext = false;
    },

    set(doc) {
      if (suppressNext) {
        state = {
          ...state,
          present: snapshot(doc),
        };
        suppressNext = false;
        return;
      }

      const next = snapshot(doc);
      if (state.present?.sig === next.sig) {
        state = {
          ...state,
          present: next,
        };
        return;
      }

      state = {
        past: state.present ? [state.present, ...state.past] : state.past,
        present: next,
        future: [],
      };
    },

    undo() {
      if (!state.present || state.past.length === 0) return undefined;
      const present = state.past[0];
      state = {
        past: state.past.slice(1),
        present,
        future: [state.present, ...state.future],
      };
      suppressNext = true;
      return present.doc;
    },

    redo() {
      if (!state.present || state.future.length === 0) return undefined;
      const present = state.future[0];
      state = {
        past: [state.present, ...state.past],
        present,
        future: state.future.slice(1),
      };
      suppressNext = true;
      return present.doc;
    },

    getState() {
      return {
        past: [...state.past],
        present: state.present,
        future: [...state.future],
      };
    },
  };
}

function emptyState(): PtbUndoHistoryState {
  return {
    past: [],
    present: undefined,
    future: [],
  };
}
