import { useCallback } from 'react';

import type { PTBDoc } from '@zktx.io/ptb-builder';

type Snapshot = { doc: PTBDoc; sig: string };

export type HistoryState = {
  past: Snapshot[];
  present: Snapshot | undefined;
  future: Snapshot[];
};

const STATE: HistoryState = { past: [], present: undefined, future: [] };
let suppressNext = false;

const stableStringify = (value: unknown): string =>
  JSON.stringify(value, (_, v) => {
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      return Object.keys(v)
        .sort()
        .reduce<Record<string, unknown>>((acc, key) => {
          acc[key] = (v as Record<string, unknown>)[key];
          return acc;
        }, {});
    }
    return v;
  });

const docSignature = (doc: PTBDoc): string =>
  stableStringify({
    version: doc.version,
    chain: doc.chain,
    view: doc.view,
    graph: doc.graph,
    modules: doc.modules,
    objects: doc.objects,
  });

export function usePtbUndo() {
  const reset = useCallback(() => {
    STATE.past = [];
    STATE.present = undefined;
    STATE.future = [];
    suppressNext = false;
  }, []);

  const set = useCallback((doc: PTBDoc) => {
    // Skip history churn when we're restoring via undo/redo load.
    if (suppressNext) {
      STATE.present = { doc, sig: docSignature(doc) };
      suppressNext = false;
      return;
    }

    const nextSnap: Snapshot = { doc, sig: docSignature(doc) };
    if (STATE.present?.sig === nextSnap.sig) {
      STATE.present = nextSnap;
      return;
    }

    if (STATE.present) STATE.past = [STATE.present, ...STATE.past];
    STATE.present = nextSnap;
    STATE.future = [];
  }, []);

  const undo = useCallback((): PTBDoc | undefined => {
    if (!STATE.present || STATE.past.length === 0) return undefined;
    const present = STATE.past[0];
    STATE.past = STATE.past.slice(1);
    STATE.future = [STATE.present, ...STATE.future];
    STATE.present = present;
    suppressNext = true; // prevent onDocChange from resetting future
    return STATE.present.doc;
  }, []);

  const redo = useCallback((): PTBDoc | undefined => {
    if (!STATE.present || STATE.future.length === 0) return undefined;
    const present = STATE.future[0];
    STATE.future = STATE.future.slice(1);
    STATE.past = [STATE.present, ...STATE.past];
    STATE.present = present;
    suppressNext = true; // prevent onDocChange from clearing redo stack
    return STATE.present.doc;
  }, []);

  return { reset, set, undo, redo };
}
