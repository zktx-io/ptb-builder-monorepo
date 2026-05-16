import { afterEach, describe, expect, it, vi } from 'vitest';

import { createDocumentEmissionScheduler } from '../src/ui/documentEmission';

describe('document emission scheduler', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('debounces content changes and flushes only the latest pending change', () => {
    vi.useFakeTimers();
    const emit = vi.fn();
    const scheduler = createDocumentEmissionScheduler({
      emit,
      contentDelayMs: 100,
      viewDelayMs: 250,
      maxWaitMs: 1000,
    });

    scheduler.schedule('content');
    vi.advanceTimersByTime(90);
    scheduler.schedule('content');
    vi.advanceTimersByTime(99);

    expect(emit).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(emit).toHaveBeenCalledTimes(1);
    expect(scheduler.hasPending()).toBe(false);
  });

  it('uses max-wait so continuous viewport changes eventually emit', () => {
    vi.useFakeTimers();
    const emit = vi.fn();
    const scheduler = createDocumentEmissionScheduler({
      emit,
      contentDelayMs: 100,
      viewDelayMs: 250,
      maxWaitMs: 500,
    });

    scheduler.schedule('view');
    for (let elapsed = 0; elapsed < 400; elapsed += 100) {
      vi.advanceTimersByTime(100);
      scheduler.schedule('view');
    }

    expect(emit).not.toHaveBeenCalled();
    vi.advanceTimersByTime(100);
    expect(emit).toHaveBeenCalledTimes(1);
    expect(scheduler.hasPending()).toBe(false);
  });

  it('does not let a later viewport schedule extend an earlier content deadline', () => {
    vi.useFakeTimers();
    const emit = vi.fn();
    const scheduler = createDocumentEmissionScheduler({
      emit,
      contentDelayMs: 100,
      viewDelayMs: 250,
      maxWaitMs: 1000,
    });

    scheduler.schedule('content');
    vi.advanceTimersByTime(10);
    scheduler.schedule('view');
    vi.advanceTimersByTime(89);

    expect(emit).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(emit).toHaveBeenCalledTimes(1);
  });

  it('lets a later content schedule shorten an earlier viewport deadline', () => {
    vi.useFakeTimers();
    const emit = vi.fn();
    const scheduler = createDocumentEmissionScheduler({
      emit,
      contentDelayMs: 100,
      viewDelayMs: 250,
      maxWaitMs: 1000,
    });

    scheduler.schedule('view');
    vi.advanceTimersByTime(10);
    scheduler.schedule('content');
    vi.advanceTimersByTime(99);

    expect(emit).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(emit).toHaveBeenCalledTimes(1);
  });

  it('flushes and cancels pending emission explicitly', () => {
    vi.useFakeTimers();
    const emit = vi.fn();
    const scheduler = createDocumentEmissionScheduler({
      emit,
      contentDelayMs: 100,
      viewDelayMs: 250,
      maxWaitMs: 1000,
    });

    scheduler.schedule('content');
    scheduler.flush();
    expect(emit).toHaveBeenCalledTimes(1);

    scheduler.schedule('content');
    scheduler.cancel();
    vi.advanceTimersByTime(1000);
    expect(emit).toHaveBeenCalledTimes(1);
    expect(scheduler.hasPending()).toBe(false);
  });
});
