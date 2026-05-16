import { describe, expect, it } from 'vitest';

import {
  clearProviderClientUnavailableNoticeState,
  clearProviderNoticeState,
  INITIAL_PROVIDER_UI_STATE,
  providerClientUnavailable,
  providerDocumentLoadError,
  providerNoticeLabel,
  providerReadyEditable,
  providerReadyReadonlyTransaction,
  providerTransactionLoadError,
  withProviderNotice,
} from '../src/ui/providerUiState';

describe('provider UI state transitions', () => {
  it('records document load errors without replacing the current transaction', () => {
    const current = providerReadyReadonlyTransaction({ status: 'success' });
    const next = providerDocumentLoadError(current, 'Invalid PTB document.');

    expect(next.transaction).toEqual({ status: 'success' });
    expect(next.notice).toEqual({
      kind: 'document-load-error',
      message: 'Invalid PTB document.',
      dismissible: true,
    });
  });

  it('clears transaction and stale notices on successful document load', () => {
    const current = withProviderNotice(
      providerReadyReadonlyTransaction({ status: 'failure', error: 'abort' }),
      {
        kind: 'document-load-error',
        message: 'Invalid PTB document.',
        dismissible: true,
      },
    );

    expect(current.transaction).toBeDefined();
    expect(providerReadyEditable()).toEqual({});
  });

  it('records transaction load errors without discarding the current viewer transaction context', () => {
    const current = providerReadyReadonlyTransaction({ status: 'success' });
    const next = providerTransactionLoadError(
      current,
      'Transaction was not found.',
    );

    expect(next).toEqual({
      transaction: { status: 'success' },
      notice: {
        kind: 'transaction-load-error',
        message: 'Transaction was not found.',
        dismissible: true,
      },
    });
  });

  it('records transaction load errors without inventing a transaction context', () => {
    expect(
      providerTransactionLoadError(
        INITIAL_PROVIDER_UI_STATE,
        'Transaction was not found.',
      ),
    ).toEqual({
      notice: {
        kind: 'transaction-load-error',
        message: 'Transaction was not found.',
        dismissible: true,
      },
    });
  });

  it('dismisses notices without changing transaction state', () => {
    const current = providerDocumentLoadError(
      INITIAL_PROVIDER_UI_STATE,
      'Invalid PTB document.',
    );

    expect(clearProviderNoticeState(current)).toEqual({
      notice: undefined,
    });
  });

  it('clears only transient client-unavailable notices after client recovery', () => {
    const current = providerClientUnavailable(
      providerReadyReadonlyTransaction({ status: 'failure', error: 'abort' }),
      'Move function lookup: no Sui client is active for the selected chain.',
    );

    expect(clearProviderClientUnavailableNoticeState(current)).toEqual({
      transaction: { status: 'failure', error: 'abort' },
      notice: undefined,
    });

    const documentError = providerDocumentLoadError(
      INITIAL_PROVIDER_UI_STATE,
      'Invalid PTB document.',
    );
    expect(clearProviderClientUnavailableNoticeState(documentError)).toBe(
      documentError,
    );
  });

  it('labels notices by the attempted operation that produced them', () => {
    expect(
      providerNoticeLabel({
        kind: 'document-load-error',
        message: 'Invalid PTB document.',
        dismissible: true,
      }),
    ).toBe('Document load failed: Invalid PTB document.');
    expect(
      providerNoticeLabel({
        kind: 'transaction-load-error',
        message: 'Transaction was not found.',
        dismissible: true,
      }),
    ).toBe('Transaction load failed: Transaction was not found.');
    expect(
      providerNoticeLabel({
        kind: 'client-unavailable',
        message:
          'Move function lookup: no Sui client is active for the selected chain.',
        dismissible: true,
      }),
    ).toBe(
      'Client unavailable: Move function lookup: no Sui client is active for the selected chain.',
    );
  });
});
