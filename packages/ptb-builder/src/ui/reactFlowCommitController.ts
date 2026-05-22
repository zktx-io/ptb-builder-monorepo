export type ReactFlowCommitScheduler = (callback: () => void) => void;

export type ReactFlowCommitController<TSnapshot> = {
  recordChange: (snapshot: TSnapshot) => void;
  startDrag: (nodeId: string) => void;
  endDrag: (nodeId?: string, snapshot?: TSnapshot) => void;
  removeNode: (nodeId: string, snapshot?: TSnapshot) => void;
  cancel: () => void;
  isDragging: () => boolean;
};

export function createReactFlowCommitController<TSnapshot>(options: {
  commit: (snapshot: TSnapshot) => void;
  schedule?: ReactFlowCommitScheduler;
  dragRecoveryMs?: number;
  setTimer?: typeof setTimeout;
  clearTimer?: typeof clearTimeout;
  onDraggingChange?: (dragging: boolean) => void;
}): ReactFlowCommitController<TSnapshot> {
  const schedule = options.schedule ?? defaultScheduler;
  const setTimer = options.setTimer ?? setTimeout;
  const clearTimer = options.clearTimer ?? clearTimeout;
  const dragRecoveryMs = options.dragRecoveryMs ?? 1500;
  const draggingNodeIds = new Set<string>();
  let pendingSnapshot: TSnapshot | undefined;
  let recoveryTimer: ReturnType<typeof setTimeout> | undefined;
  let generation = 0;
  let dragging = false;

  const emitDraggingChange = () => {
    const next = draggingNodeIds.size > 0;
    if (next === dragging) return;
    dragging = next;
    options.onDraggingChange?.(next);
  };

  const clearRecovery = () => {
    if (!recoveryTimer) return;
    clearTimer(recoveryTimer);
    recoveryTimer = undefined;
  };

  const flushPending = () => {
    if (draggingNodeIds.size > 0 || pendingSnapshot === undefined) return;
    clearRecovery();
    const snapshot = pendingSnapshot;
    const commitGeneration = generation;
    pendingSnapshot = undefined;
    schedule(() => {
      if (commitGeneration !== generation) return;
      options.commit(snapshot);
    });
  };

  const armRecovery = () => {
    clearRecovery();
    if (draggingNodeIds.size === 0) return;
    recoveryTimer = setTimer(() => {
      recoveryTimer = undefined;
      draggingNodeIds.clear();
      emitDraggingChange();
      flushPending();
    }, dragRecoveryMs);
  };

  return {
    recordChange(snapshot) {
      pendingSnapshot = snapshot;
      if (draggingNodeIds.size > 0) {
        armRecovery();
        return;
      }
      flushPending();
    },
    startDrag(nodeId) {
      generation += 1;
      draggingNodeIds.add(nodeId);
      emitDraggingChange();
      armRecovery();
    },
    endDrag(nodeId, snapshot) {
      const wasDragging = nodeId
        ? draggingNodeIds.delete(nodeId)
        : draggingNodeIds.size > 0;
      if (!nodeId) draggingNodeIds.clear();
      if (snapshot !== undefined && wasDragging) pendingSnapshot = snapshot;
      if (draggingNodeIds.size > 0) {
        emitDraggingChange();
        armRecovery();
        return;
      }
      emitDraggingChange();
      flushPending();
    },
    removeNode(nodeId, snapshot) {
      draggingNodeIds.delete(nodeId);
      if (snapshot !== undefined) pendingSnapshot = snapshot;
      if (draggingNodeIds.size > 0) {
        emitDraggingChange();
        armRecovery();
        return;
      }
      emitDraggingChange();
      flushPending();
    },
    cancel() {
      generation += 1;
      clearRecovery();
      draggingNodeIds.clear();
      emitDraggingChange();
      pendingSnapshot = undefined;
    },
    isDragging() {
      return draggingNodeIds.size > 0;
    },
  };
}

function defaultScheduler(callback: () => void): void {
  if (typeof queueMicrotask === 'function') {
    queueMicrotask(callback);
    return;
  }
  setTimeout(callback, 0);
}
