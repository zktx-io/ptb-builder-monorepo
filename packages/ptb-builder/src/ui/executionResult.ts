export type HostExecutionResult = { digest?: string; error?: string };
export type HostSimulationResult = { success?: boolean; error?: string };

export function executionResultToast(
  result: HostExecutionResult | undefined,
): { message: string; variant: 'success' | 'error' } | undefined {
  if (result?.error) {
    return { message: result.error, variant: 'error' };
  }
  if (result?.digest) {
    return { message: `Executed: ${result.digest}`, variant: 'success' };
  }
  return undefined;
}
