import { describe, expect, it, vi } from 'vitest';

import { createDebouncedCallbackController } from '../src/ui/debouncedCallback';

describe('debounced callback controller', () => {
  it('cancels a pending object-id edit before lookup writes resolved raw input', () => {
    vi.useFakeTimers();
    const calls: string[] = [];
    const debounced = createDebouncedCallbackController<[string]>({
      delayMs: 250,
      invoke: (value) => calls.push(value),
    });

    debounced.schedule('stale-object-id');
    debounced.cancel();
    calls.push('lookup-resolved-raw-input');
    vi.advanceTimersByTime(250);

    expect(calls).toEqual(['lookup-resolved-raw-input']);
    vi.useRealTimers();
  });

  it('flushes the latest pending edit only', () => {
    vi.useFakeTimers();
    const calls: string[] = [];
    const debounced = createDebouncedCallbackController<[string]>({
      delayMs: 250,
      invoke: (value) => calls.push(value),
    });

    debounced.schedule('first');
    debounced.schedule('second');
    debounced.flush();
    vi.advanceTimersByTime(250);

    expect(calls).toEqual(['second']);
    vi.useRealTimers();
  });
});
