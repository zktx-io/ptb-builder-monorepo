import { stableGraphSig } from './graphSignature';
import type { PTBGraph } from '../ptb/graph/types';
import type { PTBModulesEmbed, PTBObjectsEmbed } from '../ptb/ptbDoc';
import { stableStringify } from '../ptb/ptbDoc';
import type { Chain } from '../types';

export type EditorSessionSnapshot = {
  chain: Chain;
  graph: PTBGraph;
  modules: PTBModulesEmbed;
  objects: PTBObjectsEmbed;
  sender?: string;
};

export type EditorSessionHistoryState = {
  past: EditorSessionSnapshot[];
  present: EditorSessionSnapshot | undefined;
  future: EditorSessionSnapshot[];
};

export type EditorSessionHistoryTransaction = {
  snapshot: EditorSessionSnapshot;
  commit: () => void;
  cancel: () => void;
};

type HistoryEntry = {
  snapshot: EditorSessionSnapshot;
  sig: string;
};

type HistoryState = {
  past: HistoryEntry[];
  present: HistoryEntry | undefined;
  future: HistoryEntry[];
};

export type EditorSessionHistory = {
  reset: (snapshot?: EditorSessionSnapshot) => void;
  record: (snapshot: EditorSessionSnapshot) => void;
  replacePresent: (snapshot: EditorSessionSnapshot) => void;
  beginUndo: (
    current?: EditorSessionSnapshot,
  ) => EditorSessionHistoryTransaction | undefined;
  beginRedo: (
    current?: EditorSessionSnapshot,
  ) => EditorSessionHistoryTransaction | undefined;
  canUndo: () => boolean;
  canRedo: () => boolean;
  getState: () => EditorSessionHistoryState;
};

export function createEditorSessionSnapshot(input: {
  chain: Chain;
  graph: PTBGraph;
  modules: PTBModulesEmbed;
  objects: PTBObjectsEmbed;
  sender?: string;
}): EditorSessionSnapshot {
  return {
    chain: input.chain,
    graph: cloneJson(input.graph),
    modules: cloneJson(input.modules),
    objects: cloneJson(input.objects),
    ...(input.sender !== undefined ? { sender: input.sender } : {}),
  };
}

export function createEditorSessionHistory(): EditorSessionHistory {
  let state: HistoryState = emptyState();
  let nextTransactionId = 0;
  let pendingTransaction:
    | {
        id: number;
        before: HistoryState;
        next: HistoryState;
      }
    | undefined;

  const entry = (snapshot: EditorSessionSnapshot): HistoryEntry => {
    const cloned = createEditorSessionSnapshot(snapshot);
    return {
      snapshot: cloned,
      sig: editorSessionSnapshotSignature(cloned),
    };
  };

  const applyRecord = (next: HistoryEntry) => {
    if (state.present?.sig === next.sig) {
      state = { ...state, present: next };
      return;
    }
    state = {
      past: state.present ? [state.present, ...state.past] : state.past,
      present: next,
      future: [],
    };
  };

  const beginTransaction = (
    current: EditorSessionSnapshot | undefined,
    direction: 'undo' | 'redo',
  ): EditorSessionHistoryTransaction | undefined => {
    if (current) applyRecord(entry(current));

    const before = cloneState(state);
    let target: HistoryEntry | undefined;
    let nextState: HistoryState | undefined;

    if (direction === 'undo') {
      if (!state.present || state.past.length === 0) return undefined;
      target = state.past[0];
      nextState = {
        past: state.past.slice(1),
        present: target,
        future: [state.present, ...state.future],
      };
    } else {
      if (!state.present || state.future.length === 0) return undefined;
      target = state.future[0];
      nextState = {
        past: [state.present, ...state.past],
        present: target,
        future: state.future.slice(1),
      };
    }

    const id = ++nextTransactionId;
    pendingTransaction = { id, before, next: nextState };

    return {
      snapshot: createEditorSessionSnapshot(target.snapshot),
      commit() {
        if (pendingTransaction?.id !== id) return;
        state = pendingTransaction.next;
        pendingTransaction = undefined;
      },
      cancel() {
        if (pendingTransaction?.id !== id) return;
        state = pendingTransaction.before;
        pendingTransaction = undefined;
      },
    };
  };

  return {
    reset(snapshot) {
      state = {
        past: [],
        present: snapshot ? entry(snapshot) : undefined,
        future: [],
      };
      pendingTransaction = undefined;
    },
    record(snapshot) {
      pendingTransaction = undefined;
      applyRecord(entry(snapshot));
    },
    replacePresent(snapshot) {
      const next = entry(snapshot);
      state = {
        ...state,
        present: next,
      };
    },
    beginUndo(current) {
      return beginTransaction(current, 'undo');
    },
    beginRedo(current) {
      return beginTransaction(current, 'redo');
    },
    canUndo() {
      return Boolean(state.present && state.past.length > 0);
    },
    canRedo() {
      return Boolean(state.present && state.future.length > 0);
    },
    getState() {
      return {
        past: state.past.map((item) =>
          createEditorSessionSnapshot(item.snapshot),
        ),
        present: state.present
          ? createEditorSessionSnapshot(state.present.snapshot)
          : undefined,
        future: state.future.map((item) =>
          createEditorSessionSnapshot(item.snapshot),
        ),
      };
    },
  };
}

function editorSessionSnapshotSignature(
  snapshot: EditorSessionSnapshot,
): string {
  return `ptb-editor-session-sig-v1:${stableStringify({
    chain: snapshot.chain,
    sender: snapshot.sender,
    graph: stableGraphSig(snapshot.graph),
    modules: snapshot.modules,
    objects: snapshot.objects,
  })}`;
}

function cloneState(state: HistoryState): HistoryState {
  return {
    past: [...state.past],
    present: state.present,
    future: [...state.future],
  };
}

function emptyState(): HistoryState {
  return {
    past: [],
    present: undefined,
    future: [],
  };
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
