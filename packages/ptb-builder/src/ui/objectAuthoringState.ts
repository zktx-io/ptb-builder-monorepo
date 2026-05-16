import type { ObjectAuthoringInfo } from '../ptb/objectAuthoring';

export type ObjectAuthoringStatus =
  | 'idle'
  | 'dirty'
  | 'loading'
  | 'resolved'
  | 'unsupported'
  | 'error';

export type ObjectAuthoringState = {
  visibleObjectId: string;
  requestId: number;
  status: ObjectAuthoringStatus;
  resolved?: ObjectAuthoringInfo;
  stale?: ObjectAuthoringInfo;
  error?: string;
};

export function createObjectAuthoringState(
  visibleObjectId = '',
  requestId = 0,
): ObjectAuthoringState {
  return {
    visibleObjectId,
    requestId,
    status: visibleObjectId.trim() ? 'dirty' : 'idle',
  };
}

export function objectAuthoringInputChanged(
  state: ObjectAuthoringState,
  visibleObjectId: string,
  requestId: number,
): ObjectAuthoringState {
  const trimmed = visibleObjectId.trim();
  if (!trimmed) {
    return {
      visibleObjectId,
      requestId,
      status: 'idle',
      stale: state.resolved ?? state.stale,
    };
  }

  const previousFacts =
    state.resolved && state.resolved.objectId === trimmed
      ? state.resolved
      : undefined;

  if (previousFacts) {
    return {
      visibleObjectId,
      requestId,
      status: isUnsupportedOwner(previousFacts) ? 'unsupported' : 'resolved',
      resolved: previousFacts,
    };
  }

  const stale = state.resolved ?? state.stale;
  return {
    visibleObjectId,
    requestId,
    status: 'dirty',
    stale,
  };
}

export function objectAuthoringLookupStarted(
  state: ObjectAuthoringState,
  visibleObjectId: string,
  requestId: number,
): ObjectAuthoringState {
  return {
    visibleObjectId,
    requestId,
    status: 'loading',
    stale: state.resolved ?? state.stale,
  };
}

export function objectAuthoringLookupSucceeded(
  state: ObjectAuthoringState,
  requestId: number,
  object: ObjectAuthoringInfo,
): ObjectAuthoringState {
  if (state.requestId !== requestId) return state;
  return {
    visibleObjectId: object.objectId,
    requestId,
    status: isUnsupportedOwner(object) ? 'unsupported' : 'resolved',
    resolved: object,
  };
}

export function objectAuthoringLookupFailed(
  state: ObjectAuthoringState,
  requestId: number,
  error: string,
): ObjectAuthoringState {
  if (state.requestId !== requestId) return state;
  return {
    visibleObjectId: state.visibleObjectId,
    requestId,
    status: 'error',
    stale: state.resolved ?? state.stale,
    error,
  };
}

export function activeObjectAuthoringInfo(
  state: ObjectAuthoringState,
): ObjectAuthoringInfo | undefined {
  return state.resolved &&
    state.resolved.objectId === state.visibleObjectId.trim()
    ? state.resolved
    : undefined;
}

export function displayObjectAuthoringInfo(
  state: ObjectAuthoringState,
): ObjectAuthoringInfo | undefined {
  return activeObjectAuthoringInfo(state) ?? state.stale;
}

export function canSelectObjectRawUsage(state: ObjectAuthoringState): boolean {
  return !!activeObjectAuthoringInfo(state) && state.status !== 'unsupported';
}

export function unsupportedObjectAuthoringReason(
  info: ObjectAuthoringInfo | undefined,
): string | undefined {
  if (
    info?.ownerKind === 'ConsensusAddressOwner' ||
    info?.ownerKind === 'Unknown'
  ) {
    return `This owner kind (${info.ownerKind}) is not supported as a PTB input by this builder.`;
  }
  return undefined;
}

function isUnsupportedOwner(info: ObjectAuthoringInfo): boolean {
  return (
    info.ownerKind === 'ConsensusAddressOwner' || info.ownerKind === 'Unknown'
  );
}
