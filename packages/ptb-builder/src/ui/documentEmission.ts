export type DocumentEmissionReason = 'content' | 'view';

export type DocumentEmissionScheduler = {
  schedule: (reason: DocumentEmissionReason) => void;
  flush: () => void;
  cancel: () => void;
};

export function createDocumentEmissionScheduler(options: {
  emit: () => void;
  contentDelayMs: number;
  viewDelayMs: number;
  maxWaitMs: number;
  setTimer?: typeof setTimeout;
  clearTimer?: typeof clearTimeout;
  now?: () => number;
}): DocumentEmissionScheduler {
  const setTimer = options.setTimer ?? setTimeout;
  const clearTimer = options.clearTimer ?? clearTimeout;
  const now = options.now ?? (() => Date.now());
  let pending = false;
  let debounceTimer: ReturnType<typeof setTimeout> | undefined;
  let debounceDeadline: number | undefined;
  let debounceReason: DocumentEmissionReason | undefined;
  let maxWaitTimer: ReturnType<typeof setTimeout> | undefined;

  const clearDebounce = () => {
    if (!debounceTimer) return;
    clearTimer(debounceTimer);
    debounceTimer = undefined;
  };

  const clearMaxWait = () => {
    if (!maxWaitTimer) return;
    clearTimer(maxWaitTimer);
    maxWaitTimer = undefined;
  };

  const flush = () => {
    clearDebounce();
    debounceDeadline = undefined;
    debounceReason = undefined;
    clearMaxWait();
    if (!pending) return;
    pending = false;
    options.emit();
  };

  const schedule = (reason: DocumentEmissionReason) => {
    pending = true;
    const delay =
      reason === 'view' ? options.viewDelayMs : options.contentDelayMs;
    const currentTime = now();
    const nextDeadline = currentTime + delay;
    debounceDeadline =
      debounceDeadline === undefined ||
      reason === 'content' ||
      debounceReason !== 'content'
        ? nextDeadline
        : Math.min(debounceDeadline, nextDeadline);
    debounceReason =
      reason === 'content' ? 'content' : (debounceReason ?? reason);
    clearDebounce();
    debounceTimer = setTimer(
      flush,
      Math.max(0, debounceDeadline - currentTime),
    );
    if (!maxWaitTimer) {
      maxWaitTimer = setTimer(flush, options.maxWaitMs);
    }
  };

  return {
    schedule,
    flush,
    cancel() {
      clearDebounce();
      debounceDeadline = undefined;
      debounceReason = undefined;
      clearMaxWait();
      pending = false;
    },
  };
}
