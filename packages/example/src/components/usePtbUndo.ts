import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useMemo,
  useRef,
} from 'react';
import type { ReactNode } from 'react';

import type { PTBDoc } from '@zktx.io/ptb-builder';

import { createPtbUndoHistory } from './ptbUndoHistory';

export type PtbUndoApi = {
  reset: () => void;
  set: (doc: PTBDoc) => void;
  undo: () => PTBDoc | undefined;
  redo: () => PTBDoc | undefined;
};

const PtbUndoContext = createContext<PtbUndoApi | undefined>(undefined);

export function PtbUndoProvider({ children }: { children: ReactNode }) {
  const historyRef = useRef(createPtbUndoHistory());

  const reset = useCallback(() => {
    historyRef.current.reset();
  }, []);

  const set = useCallback((doc: PTBDoc) => {
    historyRef.current.set(doc);
  }, []);

  const undo = useCallback((): PTBDoc | undefined => {
    return historyRef.current.undo();
  }, []);

  const redo = useCallback((): PTBDoc | undefined => {
    return historyRef.current.redo();
  }, []);

  const api = useMemo<PtbUndoApi>(
    () => ({ reset, set, undo, redo }),
    [reset, set, undo, redo],
  );

  return createElement(PtbUndoContext.Provider, { value: api }, children);
}

export function usePtbUndo() {
  const api = useContext(PtbUndoContext);
  if (!api) {
    throw new Error('usePtbUndo must be used within PtbUndoProvider.');
  }
  return api;
}
