export type TxStatus = {
  status: 'success' | 'failure';
  errorKind?: string;
  error?: string;
};

export type ProviderNotice = {
  kind:
    | 'document-load-error'
    | 'transaction-load-error'
    | 'document-emit-error'
    | 'export-error'
    | 'client-unavailable';
  message: string;
  dismissible: boolean;
};

export type ProviderUiState = {
  transaction?: TxStatus;
  notice?: ProviderNotice;
};

export const INITIAL_PROVIDER_UI_STATE: ProviderUiState = {};

export function withProviderNotice(
  state: ProviderUiState,
  notice: ProviderNotice,
): ProviderUiState {
  return { ...state, notice };
}

export function clearProviderNoticeState(
  state: ProviderUiState,
): ProviderUiState {
  return state.notice ? { ...state, notice: undefined } : state;
}

export function clearProviderClientUnavailableNoticeState(
  state: ProviderUiState,
): ProviderUiState {
  return state.notice?.kind === 'client-unavailable'
    ? clearProviderNoticeState(state)
    : state;
}

export function providerNoticeLabel(notice: ProviderNotice): string {
  const prefix =
    notice.kind === 'document-load-error'
      ? 'Document load failed'
      : notice.kind === 'transaction-load-error'
        ? 'Transaction load failed'
        : notice.kind === 'document-emit-error'
          ? 'Document emit failed'
          : notice.kind === 'export-error'
            ? 'Export failed'
            : 'Client unavailable';
  return notice.message ? `${prefix}: ${notice.message}` : prefix;
}

export function providerDocumentLoadError(
  state: ProviderUiState,
  message: string,
): ProviderUiState {
  return withProviderNotice(state, {
    kind: 'document-load-error',
    message,
    dismissible: true,
  });
}

export function providerTransactionLoadError(
  state: ProviderUiState,
  message: string,
): ProviderUiState {
  return withProviderNotice(state, {
    kind: 'transaction-load-error',
    message,
    dismissible: true,
  });
}

export function providerDocumentEmitError(
  state: ProviderUiState,
  message: string,
): ProviderUiState {
  return withProviderNotice(state, {
    kind: 'document-emit-error',
    message,
    dismissible: true,
  });
}

export function providerExportError(
  state: ProviderUiState,
  message: string,
): ProviderUiState {
  return withProviderNotice(state, {
    kind: 'export-error',
    message,
    dismissible: true,
  });
}

export function providerClientUnavailable(
  state: ProviderUiState,
  message: string,
): ProviderUiState {
  return withProviderNotice(state, {
    kind: 'client-unavailable',
    message,
    dismissible: true,
  });
}

export function providerReadyEditable(): ProviderUiState {
  return {};
}

export function providerReadyReadonlyTransaction(
  transaction?: TxStatus,
): ProviderUiState {
  return transaction ? { transaction } : {};
}

export function isMoveAbortTransaction(transaction?: TxStatus): boolean {
  return (
    transaction?.status === 'failure' && transaction.errorKind === 'MoveAbort'
  );
}
