type TimerId = ReturnType<typeof setTimeout>;

type TimerApi = {
  setTimeout: (fn: () => void, delayMs: number) => TimerId;
  clearTimeout: (id: TimerId) => void;
};

export type DebouncedCallbackController<T extends unknown[]> = {
  schedule: (...args: T) => void;
  cancel: () => void;
  flush: () => void;
  setDelay: (delayMs: number) => void;
  dispose: () => void;
};

export function createDebouncedCallbackController<T extends unknown[]>(opts: {
  delayMs: number;
  invoke: (...args: T) => void;
  timers?: TimerApi;
}): DebouncedCallbackController<T> {
  const timers = opts.timers ?? globalThis;
  let delayMs = opts.delayMs;
  let timer: TimerId | undefined;
  let args: T | undefined;
  let disposed = false;

  const cancel = () => {
    if (timer !== undefined) {
      timers.clearTimeout(timer);
      timer = undefined;
    }
    args = undefined;
  };

  const flush = () => {
    const nextArgs = args;
    cancel();
    if (!disposed && nextArgs) {
      opts.invoke(...nextArgs);
    }
  };

  return {
    schedule: (...nextArgs: T) => {
      cancel();
      args = nextArgs;
      timer = timers.setTimeout(flush, delayMs);
    },
    cancel,
    flush,
    setDelay: (nextDelayMs) => {
      delayMs = nextDelayMs;
    },
    dispose: () => {
      disposed = true;
      cancel();
    },
  };
}
