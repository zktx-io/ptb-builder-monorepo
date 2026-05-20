import type { ObjectMetadataInfo } from '../ptb/objectMetadata';

export type ObjectMetadataStatus =
  | 'idle'
  | 'dirty'
  | 'loading'
  | 'resolved'
  | 'error';

export type ObjectMetadataState = {
  visibleObjectId: string;
  requestId: number;
  status: ObjectMetadataStatus;
  resolved?: ObjectMetadataInfo;
  stale?: ObjectMetadataInfo;
  error?: string;
};

export function createObjectMetadataState(
  visibleObjectId = '',
  requestId = 0,
): ObjectMetadataState {
  return {
    visibleObjectId,
    requestId,
    status: visibleObjectId.trim() ? 'dirty' : 'idle',
  };
}

export function objectMetadataInputChanged(
  state: ObjectMetadataState,
  visibleObjectId: string,
  requestId: number,
): ObjectMetadataState {
  const trimmed = visibleObjectId.trim();
  if (!trimmed) {
    return {
      visibleObjectId,
      requestId,
      status: 'idle',
      stale: state.resolved ?? state.stale,
    };
  }

  const previous =
    state.resolved && state.resolved.objectId === trimmed
      ? state.resolved
      : undefined;

  if (previous) {
    return {
      visibleObjectId,
      requestId,
      status: 'resolved',
      resolved: previous,
    };
  }

  return {
    visibleObjectId,
    requestId,
    status: 'dirty',
    stale: state.resolved ?? state.stale,
  };
}

export function objectMetadataLookupStarted(
  state: ObjectMetadataState,
  visibleObjectId: string,
  requestId: number,
): ObjectMetadataState {
  return {
    visibleObjectId,
    requestId,
    status: 'loading',
    stale: state.resolved ?? state.stale,
  };
}

export function objectMetadataLookupSucceeded(
  state: ObjectMetadataState,
  requestId: number,
  object: ObjectMetadataInfo,
): ObjectMetadataState {
  if (state.requestId !== requestId) return state;
  return {
    visibleObjectId: object.objectId,
    requestId,
    status: 'resolved',
    resolved: object,
  };
}

export function objectMetadataLookupFailed(
  state: ObjectMetadataState,
  requestId: number,
  error: string,
): ObjectMetadataState {
  if (state.requestId !== requestId) return state;
  return {
    visibleObjectId: state.visibleObjectId,
    requestId,
    status: 'error',
    stale: state.resolved ?? state.stale,
    error,
  };
}

export function activeObjectMetadataInfo(
  state: ObjectMetadataState,
): ObjectMetadataInfo | undefined {
  return state.resolved &&
    state.resolved.objectId === state.visibleObjectId.trim()
    ? state.resolved
    : undefined;
}

export function displayObjectMetadataInfo(
  state: ObjectMetadataState,
): ObjectMetadataInfo | undefined {
  return activeObjectMetadataInfo(state) ?? state.stale;
}
