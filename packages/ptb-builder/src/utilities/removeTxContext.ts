import {
  SuiMoveNormalizedFunction,
  SuiMoveNormalizedType,
} from '@mysten/sui/client';

export const removeTxContext = (
  func: SuiMoveNormalizedFunction,
): SuiMoveNormalizedType[] => {
  return func.parameters.filter((type) => {
    if (typeof type === 'object') {
      const struct =
        (type as any).MutableReference?.Struct ||
        (type as any).Reference?.Struct ||
        (type as any).Struct;
      return !(
        struct &&
        struct.address === '0x2' &&
        struct.module === 'tx_context' &&
        struct.name === 'TxContext'
      );
    }
    return true;
  });
};
