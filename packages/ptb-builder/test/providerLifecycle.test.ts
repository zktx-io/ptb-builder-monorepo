import { describe, expect, it, vi } from 'vitest';

import { createProviderLifecycleController } from '../src/ui/providerLifecycle';

function makeFrameScheduler() {
  let nextHandle = 0;
  const callbacks = new Map<number, () => void>();
  return {
    scheduler: {
      request(callback: () => void) {
        nextHandle += 1;
        callbacks.set(nextHandle, callback);
        return nextHandle;
      },
      cancel(handle: unknown) {
        callbacks.delete(handle as number);
      },
    },
    flushOne() {
      const [handle, callback] = callbacks.entries().next().value ?? [];
      if (handle === undefined || !callback) return false;
      callbacks.delete(handle);
      callback();
      return true;
    },
    pendingCount() {
      return callbacks.size;
    },
  };
}

describe('provider lifecycle controller', () => {
  it('invalidates older loads when a new load begins', () => {
    const controller = createProviderLifecycleController();
    const first = controller.beginLoad('document');
    const second = controller.beginLoad('transaction');

    expect(controller.isCurrent(first)).toBe(false);
    expect(controller.isCurrent(second)).toBe(true);
    expect(controller.current()).toEqual({
      kind: 'loading-transaction',
      loadId: second.id,
    });
  });

  it('tracks ready and error status only for the current load', () => {
    const controller = createProviderLifecycleController();
    const stale = controller.beginLoad('document');
    const current = controller.beginLoad('transaction');

    expect(controller.complete(stale, 'ready-editable')).toBe(false);
    expect(controller.fail(stale, 'stale failure')).toBe(false);
    expect(controller.complete(current, 'ready-readonly-transaction')).toBe(
      true,
    );
    expect(controller.current()).toEqual({
      kind: 'ready-readonly-transaction',
      loadId: current.id,
    });
  });

  it('runs delayed frame callbacks only while the load remains current', () => {
    const frames = makeFrameScheduler();
    const callback = vi.fn();
    const controller = createProviderLifecycleController({
      frameScheduler: frames.scheduler,
    });
    const load = controller.beginLoad('document');

    controller.afterAnimationFrames(load, callback, 2);
    expect(frames.pendingCount()).toBe(1);

    frames.flushOne();
    expect(callback).not.toHaveBeenCalled();
    expect(frames.pendingCount()).toBe(1);

    controller.beginLoad('transaction');
    expect(frames.pendingCount()).toBe(0);
    expect(callback).not.toHaveBeenCalled();
  });

  it('cancels pending frames and invalidates the current load', () => {
    const frames = makeFrameScheduler();
    const callback = vi.fn();
    const controller = createProviderLifecycleController({
      frameScheduler: frames.scheduler,
    });
    const load = controller.beginLoad('document');

    controller.afterAnimationFrames(load, callback);
    expect(frames.pendingCount()).toBe(1);

    controller.cancel();
    expect(controller.isCurrent(load)).toBe(false);
    expect(controller.current()).toEqual({ kind: 'uninitialized' });
    expect(frames.pendingCount()).toBe(0);

    frames.flushOne();
    expect(callback).not.toHaveBeenCalled();
  });
});
