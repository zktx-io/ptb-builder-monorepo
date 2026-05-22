import { describe, expect, it } from 'vitest';

import { createProviderLifecycleController } from '../src/ui/providerLifecycle';

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

  it('invalidates the current load when canceled', () => {
    const controller = createProviderLifecycleController();
    const load = controller.beginLoad('document');

    controller.cancel();
    expect(controller.isCurrent(load)).toBe(false);
    expect(controller.current()).toEqual({ kind: 'uninitialized' });
  });
});
