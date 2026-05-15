import { describe, expect, it } from 'vitest';

import { executionResultToast } from '../src/ui/executionResult';

describe('execution result reporting', () => {
  it('treats error as authoritative when a host adapter also returns a digest', () => {
    expect(
      executionResultToast({
        digest: '0xfailed',
        error: 'Transaction execution failed',
      }),
    ).toEqual({
      message: 'Transaction execution failed',
      variant: 'error',
    });
  });

  it('reports success only when the host adapter returns a digest without error', () => {
    expect(executionResultToast({ digest: '0xsuccess' })).toEqual({
      message: 'Executed: 0xsuccess',
      variant: 'success',
    });
  });
});
