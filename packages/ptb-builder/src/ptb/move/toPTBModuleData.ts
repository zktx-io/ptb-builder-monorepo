// src/ptb/move/toPTBModuleData.ts

// -----------------------------------------------------------------------------
// Convert on-chain normalized modules (Sui ABI) → PTB-friendly view
// PTBModuleData: only the data PTB actually needs (tparamCount, ins, outs).
// -----------------------------------------------------------------------------

import type {
  SuiMoveNormalizedModule,
  SuiMoveNormalizedModules,
  SuiMoveNormalizedType,
} from '@mysten/sui/client';

import { toPTBTypeFromMove } from './toPTBType';
import type { PTBFunctionData } from '../ptbDoc';

/**
 * Drop TxContext from a list of Move types.
 * PTB doesn’t model TxContext, so removing it keeps IO counts consistent.
 */
function deleteTxContext(
  types: SuiMoveNormalizedType[],
): SuiMoveNormalizedType[] {
  return (types || []).filter((type) => {
    if (typeof type === 'object' && type) {
      const s =
        (type as any).MutableReference?.Struct ||
        (type as any).Reference?.Struct ||
        (type as any).Struct;
      // 0x2::tx_context::TxContext
      return !(
        s &&
        s.address === '0x2' &&
        s.module === 'tx_context' &&
        s.name === 'TxContext'
      );
    }
    return true;
  });
}

/**
 * Normalize on-chain modules into PTBFunctionData view.
 *
 * @param data SuiMoveNormalizedModules (from SuiClient)
 * @returns Record<string, PTBFunctionData> keyed by moduleName
 */
export function toPTBModuleData(
  data: SuiMoveNormalizedModules,
): Record<string, PTBFunctionData> {
  const out: Record<string, PTBFunctionData> = {};

  for (const [moduleName, moduleData] of Object.entries(
    data as Record<string, SuiMoveNormalizedModule>,
  )) {
    const funcs: PTBFunctionData = {};

    const names = Object.keys(moduleData.exposedFunctions).sort();

    for (const fname of names) {
      const f = moduleData.exposedFunctions[fname];

      const paramsNoCtx = deleteTxContext(f.parameters || []);
      const returnNoCtx = deleteTxContext(f.return || []);

      const ins = paramsNoCtx.map(toPTBTypeFromMove);
      const outs = returnNoCtx.map(toPTBTypeFromMove);

      const tparamCount = Array.isArray(f.typeParameters)
        ? f.typeParameters.length
        : typeof (f as any)?.typeParameters === 'number'
          ? (f as any).typeParameters
          : 0;

      funcs[fname] = {
        tparamCount,
        ins,
        outs,
      } as any;
    }

    out[moduleName] = funcs;
  }

  return out;
}
