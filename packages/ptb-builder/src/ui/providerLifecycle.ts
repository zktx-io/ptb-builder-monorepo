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
};

export function createProviderLifecycleController(): ProviderLifecycleController {
  let nextId = 0;
  let status: ProviderLifecycleStatus = { kind: 'uninitialized' };

  const isCurrent = (token: ProviderLoadToken) => token.id === nextId;

  const beginLoad = (kind: ProviderLoadKind): ProviderLoadToken => {
    nextId += 1;
    const token: ProviderLoadToken = { id: nextId, kind };
    status =
      kind === 'document'
        ? { kind: 'loading-document', loadId: token.id }
        : { kind: 'loading-transaction', loadId: token.id };
    return token;
  };

  return {
    beginLoad,
    cancel() {
      nextId += 1;
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
  };
}
