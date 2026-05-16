import type { PTBDoc } from '../ptb/ptbDoc';

export type PTBActionResult = { ok: true } | { ok: false; error: string };
export type PTBExportDocResult =
  | { ok: true; doc: PTBDoc }
  | { ok: false; error: string };

export const PTB_ACTION_OK: PTBActionResult = { ok: true };

export function ptbActionError(error: string): PTBActionResult {
  return { ok: false, error };
}

export function ptbExportDocError(error: string): PTBExportDocResult {
  return { ok: false, error };
}
