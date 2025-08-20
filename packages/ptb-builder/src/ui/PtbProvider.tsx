// PtbProvider.tsx
import React, {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import type { Transaction } from '@mysten/sui/transactions';

import { consoleToast, type ToastAdapter } from '../adapters/toast';
import type { PTBGraph } from '../ptb/graph/types';
import { ValidationResult } from '../ptb/graph/validation';
import { seedDefaultGraph } from '../ptb/seedGraph';
import type { Network, Theme } from '../types';

export type Adapters = {
  clipboard?: { copy(text: string): Promise<void> };
  executeTx?: (
    tx: Transaction | undefined,
  ) => Promise<{ digest?: string; error?: string }>;
  toast?: ToastAdapter;
};

export type Features = { codegen?: boolean; parse?: boolean; exec?: boolean };

export type PtbContextValue = {
  // persisted PTBGraph snapshot (read-only for consumers)
  snapshot: PTBGraph;
  // persist (debounced by provider)
  saveSnapshot: (g: PTBGraph) => void;
  // replace snapshot immediately (e.g., open file)
  loadSnapshot: (g: PTBGraph) => void;

  network: Network;
  readOnly: boolean;
  features?: Features;
  adapters?: Adapters;
  validation?: ValidationResult;
  busy: boolean;

  theme: Theme;
  setTheme: (t: Theme) => void;
};

const PtbContext = createContext<PtbContextValue | undefined>(undefined);

export type PtbProviderProps = {
  children: React.ReactNode;
  initialGraph?: PTBGraph; // used once at mount
  onChange?: (g: PTBGraph) => void; // external persistence callback
  onChangeDebounceMs?: number; // debounce for onChange (default 400ms)
  network?: Network;
  lockNetwork?: boolean;
  readOnly?: boolean;
  adapters?: Adapters;
  features?: Features;
  theme?: Theme;
};

const DEFAULT_DEBOUNCE = 400;

export function PtbProvider({
  children,
  initialGraph,
  onChange,
  onChangeDebounceMs = DEFAULT_DEBOUNCE,
  network = 'devnet',
  lockNetwork,
  readOnly = false,
  adapters,
  features,
  theme: themeProp = 'dark',
}: PtbProviderProps) {
  const [busy] = useState(false);
  const [theme, setTheme] = useState<Theme>(themeProp);

  // snapshot: the persisted/persistable PTBGraph
  const [snapshot, setSnapshot] = useState<PTBGraph>(() =>
    initialGraph?.nodes?.length ? initialGraph : seedDefaultGraph(),
  );

  // Apply dark class early to avoid FOUC
  useLayoutEffect(() => {
    const root = document.documentElement;
    theme === 'dark'
      ? root.classList.add('dark')
      : root.classList.remove('dark');
  }, [theme]);

  // Toast and adapters
  const toastImpl: ToastAdapter = adapters?.toast ?? consoleToast;
  const exec = adapters?.executeTx;
  const executeTx = useCallback(
    async (tx?: Transaction) => {
      if (!exec) {
        toastImpl({
          message: 'executeTx adapter not provided',
          variant: 'warning',
        });
        return { error: 'executeTx adapter not provided' };
      }
      try {
        const res = await exec(tx);
        if (res?.digest)
          toastImpl({ message: `Executed: ${res.digest}`, variant: 'success' });
        else if (res?.error)
          toastImpl({ message: res.error, variant: 'error' });
        return res ?? {};
      } catch (e: any) {
        const msg = e?.message || 'Unknown execution error';
        toastImpl({ message: msg, variant: 'error' });
        return { error: msg };
      }
    },
    [exec, toastImpl],
  );

  const adaptersSnapshot = useMemo(
    () => ({ clipboard: adapters?.clipboard, executeTx, toast: toastImpl }),
    [adapters?.clipboard, executeTx, toastImpl],
  );

  // Debounced external notify (for onChange)
  const onChangeRef = useRef(onChange);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const lastGraphRef = useRef<PTBGraph | undefined>(undefined);
  onChangeRef.current = onChange;

  const flushNotify = useCallback(() => {
    if (timerRef.current !== undefined) {
      clearTimeout(timerRef.current);
      timerRef.current = undefined;
    }
    const payload = lastGraphRef.current;
    if (payload && onChangeRef.current) onChangeRef.current(payload);
    lastGraphRef.current = undefined;
  }, []);

  const scheduleNotify = useCallback(
    (g: PTBGraph) => {
      if (!onChangeRef.current) return; // no external callback
      lastGraphRef.current = g;
      if (timerRef.current !== undefined) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        const payload = lastGraphRef.current;
        if (payload && onChangeRef.current) onChangeRef.current(payload);
        timerRef.current = undefined;
        lastGraphRef.current = undefined;
      }, onChangeDebounceMs);
    },
    [onChangeDebounceMs],
  );

  // Public API: saveSnapshot (updates snapshot and debounced notify)
  const saveSnapshot = useCallback(
    (g: PTBGraph) => {
      setSnapshot(g); // update provider state
      scheduleNotify(g); // debounce external persistence
    },
    [scheduleNotify],
  );

  // Public API: loadSnapshot (replace immediately, cancel pending debounce)
  const loadSnapshot = useCallback((g: PTBGraph) => {
    if (timerRef.current !== undefined) {
      clearTimeout(timerRef.current);
      timerRef.current = undefined;
    }
    lastGraphRef.current = undefined;
    setSnapshot(g);
    // Do not call onChange here automatically; caller can decide to persist.
  }, []);

  const ctx: PtbContextValue = useMemo(
    () => ({
      snapshot,
      saveSnapshot,
      loadSnapshot,
      network,
      readOnly: !!readOnly || !!lockNetwork,
      features,
      adapters: adaptersSnapshot,
      validation: undefined,
      busy,
      theme,
      setTheme,
    }),
    [
      snapshot,
      saveSnapshot,
      loadSnapshot,
      network,
      readOnly,
      lockNetwork,
      features,
      adaptersSnapshot,
      busy,
      theme,
    ],
  );

  // Cleanup debounce on unmount
  React.useEffect(() => () => flushNotify(), [flushNotify]);

  return <PtbContext.Provider value={ctx}>{children}</PtbContext.Provider>;
}

export function usePtb() {
  const ctx = useContext(PtbContext);
  if (!ctx) throw new Error('usePtb must be used within PtbProvider');
  return ctx;
}
