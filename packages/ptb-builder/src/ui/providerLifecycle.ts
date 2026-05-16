export type ProviderLoadKind = 'document' | 'transaction';

export type ProviderLifecycleStatus =
  | { kind: 'uninitialized' }
  | { kind: 'loading-document'; loadId: number }
  | { kind: 'loading-transaction'; loadId: number }
  | { kind: 'ready-editable'; loadId: number }
  | { kind: 'ready-readonly-transaction'; loadId: number }
  | { kind: 'error'; loadId: number; message: string };

export type ProviderLoadToken = {
  id: number;
  kind: ProviderLoadKind;
};

type FrameHandle = unknown;
type FrameScheduler = {
  request: (callback: () => void) => FrameHandle;
  cancel: (handle: FrameHandle) => void;
};

export type ProviderLifecycleController = {
  beginLoad: (kind: ProviderLoadKind) => ProviderLoadToken;
  cancel: () => void;
  current: () => ProviderLifecycleStatus;
  isCurrent: (token: ProviderLoadToken) => boolean;
  complete: (
    token: ProviderLoadToken,
    status: Extract<
      ProviderLifecycleStatus['kind'],
      'ready-editable' | 'ready-readonly-transaction'
    >,
  ) => boolean;
  fail: (token: ProviderLoadToken, message: string) => boolean;
  afterAnimationFrames: (
    token: ProviderLoadToken,
    callback: () => void,
    frames?: number,
  ) => void;
};

export function createProviderLifecycleController(options?: {
  frameScheduler?: FrameScheduler;
}): ProviderLifecycleController {
  const frameScheduler = options?.frameScheduler ?? defaultFrameScheduler();
  const frameHandles = new Set<FrameHandle>();
  let nextId = 0;
  let status: ProviderLifecycleStatus = { kind: 'uninitialized' };

  const clearFrames = () => {
    for (const handle of frameHandles) {
      frameScheduler.cancel(handle);
    }
    frameHandles.clear();
  };

  const isCurrent = (token: ProviderLoadToken) => token.id === nextId;

  const beginLoad = (kind: ProviderLoadKind): ProviderLoadToken => {
    nextId += 1;
    clearFrames();
    const token: ProviderLoadToken = { id: nextId, kind };
    status =
      kind === 'document'
        ? { kind: 'loading-document', loadId: token.id }
        : { kind: 'loading-transaction', loadId: token.id };
    return token;
  };

  const scheduleFrame = (
    token: ProviderLoadToken,
    remainingFrames: number,
    callback: () => void,
  ) => {
    const handle = frameScheduler.request(() => {
      frameHandles.delete(handle);
      if (!isCurrent(token)) return;
      if (remainingFrames <= 1) {
        callback();
        return;
      }
      scheduleFrame(token, remainingFrames - 1, callback);
    });
    frameHandles.add(handle);
  };

  return {
    beginLoad,
    cancel() {
      nextId += 1;
      clearFrames();
      status = { kind: 'uninitialized' };
    },
    current() {
      return status;
    },
    isCurrent,
    complete(token, nextStatus) {
      if (!isCurrent(token)) return false;
      status = { kind: nextStatus, loadId: token.id };
      return true;
    },
    fail(token, message) {
      if (!isCurrent(token)) return false;
      status = { kind: 'error', loadId: token.id, message };
      return true;
    },
    afterAnimationFrames(token, callback, frames = 2) {
      if (!isCurrent(token)) return;
      scheduleFrame(token, Math.max(1, frames), callback);
    },
  };
}

function defaultFrameScheduler(): FrameScheduler {
  return {
    request(callback) {
      if (typeof requestAnimationFrame === 'function') {
        return requestAnimationFrame(() => callback());
      }
      return setTimeout(callback, 0);
    },
    cancel(handle) {
      if (typeof cancelAnimationFrame === 'function') {
        cancelAnimationFrame(handle as number);
        return;
      }
      clearTimeout(handle as ReturnType<typeof setTimeout>);
    },
  };
}
