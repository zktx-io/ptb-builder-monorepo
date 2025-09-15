import { useCallback } from 'react';

import type { PTBDoc } from '@zktx.io/ptb-builder';

export type HistoryState = {
  past: PTBDoc[];
  present: PTBDoc | undefined;
  future: PTBDoc[];
};

const STATE: HistoryState = { past: [], present: undefined, future: [] };

export function usePtbUndo() {
  const reset = useCallback(() => {
    STATE.past = [];
    STATE.present = undefined;
    STATE.future = [];
  }, []);

  const set = useCallback((doc: PTBDoc) => {
    if (STATE.present && STATE.present === doc) return;
    if (STATE.present) {
      STATE.past = [STATE.present, ...STATE.past];
    }
    STATE.present = doc;
    STATE.future = [];
  }, []);

  const undo = useCallback((): PTBDoc | undefined => {
    if (!STATE.present || STATE.past.length === 0) return undefined;
    const present = STATE.past[0];
    STATE.past = STATE.past.slice(1);
    STATE.future = [STATE.present, ...STATE.future];
    STATE.present = present;
    return STATE.present;
  }, []);

  const redo = useCallback((): PTBDoc | undefined => {
    if (!STATE.present || STATE.future.length === 0) return undefined;
    const present = STATE.future[0];
    STATE.future = STATE.future.slice(1);
    STATE.past = [STATE.present, ...STATE.past];
    STATE.present = present;
    return STATE.present;
  }, []);

  return { reset, set, undo, redo };
}
