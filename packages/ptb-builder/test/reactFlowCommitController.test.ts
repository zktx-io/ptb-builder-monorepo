import { afterEach, describe, expect, it, vi } from 'vitest';

import { createReactFlowCommitController } from '../src/ui/reactFlowCommitController';

describe('React Flow commit controller', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('commits non-drag changes through the scheduler', () => {
    const commit = vi.fn();
    const scheduled: Array<() => void> = [];
    const controller = createReactFlowCommitController<string>({
      commit,
      schedule: (callback) => scheduled.push(callback),
    });

    controller.recordChange('A');
    expect(commit).not.toHaveBeenCalled();
    scheduled.shift()?.();
    expect(commit).toHaveBeenCalledWith('A');
  });

  it('defers changes while dragging and commits the last pending snapshot on drag end', () => {
    const commit = vi.fn();
    const controller = createReactFlowCommitController<string>({
      commit,
      schedule: (callback) => callback(),
    });

    controller.startDrag('node-1');
    controller.recordChange('A');
    controller.recordChange('B');
    expect(commit).not.toHaveBeenCalled();

    controller.endDrag('node-1');
    expect(commit).toHaveBeenCalledTimes(1);
    expect(commit).toHaveBeenCalledWith('B');
  });

  it('commits an explicit drag-stop snapshot instead of reading a later snapshot', () => {
    const commit = vi.fn();
    const controller = createReactFlowCommitController<string>({
      commit,
      schedule: (callback) => callback(),
    });

    controller.startDrag('node-1');
    controller.recordChange('latest-before-stop');
    controller.endDrag('node-1', 'captured-stop');

    expect(commit).toHaveBeenCalledTimes(1);
    expect(commit).toHaveBeenCalledWith('captured-stop');
  });

  it('removing a dragged node clears that drag and flushes pending changes', () => {
    const commit = vi.fn();
    const controller = createReactFlowCommitController<string>({
      commit,
      schedule: (callback) => callback(),
    });

    controller.startDrag('node-1');
    controller.recordChange('during-drag');
    controller.removeNode('node-1', 'after-remove');

    expect(controller.isDragging()).toBe(false);
    expect(commit).toHaveBeenCalledWith('after-remove');
  });

  it('cancel clears active drag and pending snapshots without committing', () => {
    const commit = vi.fn();
    const controller = createReactFlowCommitController<string>({
      commit,
      schedule: (callback) => callback(),
    });

    controller.startDrag('node-1');
    controller.recordChange('pending');
    controller.cancel();

    expect(controller.isDragging()).toBe(false);
    expect(commit).not.toHaveBeenCalled();
  });

  it('cancel invalidates commits that were already handed to the scheduler', () => {
    const commit = vi.fn();
    const scheduled: Array<() => void> = [];
    const controller = createReactFlowCommitController<string>({
      commit,
      schedule: (callback) => scheduled.push(callback),
    });

    controller.recordChange('stale');
    expect(scheduled).toHaveLength(1);

    controller.cancel();
    scheduled.shift()?.();

    expect(commit).not.toHaveBeenCalled();
  });

  it('ignores a drag-stop snapshot for a node that is no longer dragging', () => {
    const commit = vi.fn();
    const controller = createReactFlowCommitController<string>({
      commit,
      schedule: (callback) => callback(),
    });

    controller.startDrag('node-1');
    controller.recordChange('latest-before-stop');
    controller.endDrag('node-1', 'captured-stop');
    controller.endDrag('node-1', 'stale-stop');

    expect(commit).toHaveBeenCalledTimes(1);
    expect(commit).toHaveBeenCalledWith('captured-stop');
  });

  it('invalidates already scheduled commits when a new drag session starts', () => {
    const commit = vi.fn();
    const scheduled: Array<() => void> = [];
    const controller = createReactFlowCommitController<string>({
      commit,
      schedule: (callback) => scheduled.push(callback),
    });

    controller.recordChange('before-drag');
    controller.startDrag('node-1');
    scheduled.shift()?.();
    expect(commit).not.toHaveBeenCalled();

    controller.recordChange('during-drag');
    controller.endDrag('node-1', 'drag-stop');
    scheduled.shift()?.();

    expect(commit).toHaveBeenCalledTimes(1);
    expect(commit).toHaveBeenCalledWith('drag-stop');
  });

  it('recovers a missing drag-stop event after the last pending drag change', () => {
    vi.useFakeTimers();
    const commit = vi.fn();
    const controller = createReactFlowCommitController<string>({
      commit,
      schedule: (callback) => callback(),
      dragRecoveryMs: 500,
    });

    controller.startDrag('node-1');
    controller.recordChange('pending');
    vi.advanceTimersByTime(499);

    expect(controller.isDragging()).toBe(true);
    expect(commit).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(controller.isDragging()).toBe(false);
    expect(commit).toHaveBeenCalledWith('pending');
  });
});
