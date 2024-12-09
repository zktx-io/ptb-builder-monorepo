import { SuiMoveNormalizedType } from '@mysten/sui/client';

import { getTypeName } from './getTypeName';

interface FuncArg {
  id: string;
  type:
    | 'address'
    | 'bool'
    | 'object'
    | 'number'
    | 'vector<u8>'
    | 'vector<u16>'
    | 'vector<u32>'
    | 'vector<u64>'
    | 'vector<u128>'
    | 'vector<u256>'
    | undefined;
  placeHolder: string;
  value: string;
}

const numericTypes = new Set(['U8', 'U16', 'U32', 'U64', 'U128', 'U256']);
const objectTypes = new Set(['Reference', 'MutableReference', 'Struct']);

export const PREFIX = 'param-';

export const getMoveCallFuncArg = (
  item: SuiMoveNormalizedType,
  index: number,
): FuncArg => {
  if (item === 'Address') {
    return {
      id: `${PREFIX}${index}`,
      type: 'address',
      placeHolder: getTypeName(item),
      value: '',
    };
  }
  if (item === 'Bool') {
    return {
      id: `${PREFIX}${index}`,
      type: 'bool',
      placeHolder: getTypeName(item),
      value: '',
    };
  }
  if (typeof item === 'string' && numericTypes.has(item)) {
    return {
      id: `${PREFIX}${index}`,
      type: 'number',
      placeHolder: getTypeName(item),
      value: '',
    };
  }
  if (typeof item === 'object' && 'Vector' in item) {
    return {
      id: `${PREFIX}${index}`,
      type: `vector<${item.Vector}>`.toLowerCase() as any,
      placeHolder: getTypeName(item),
      value: '',
    };
  }
  if (typeof item === 'object' && objectTypes.has(Object.keys(item)[0])) {
    if ('Reference' in item) {
      return getMoveCallFuncArg(item.Reference, index);
    }
    if ('MutableReference' in item) {
      return getMoveCallFuncArg(item.MutableReference, index);
    }
    if ('Struct' in item) {
      return {
        id: `${PREFIX}${index}`,
        type: 'object',
        placeHolder: getTypeName(item),
        value: '',
      };
    }
  }
  return {
    id: `${PREFIX}${index}`,
    type: undefined,
    placeHolder: getTypeName(item),
    value: '',
  };
};
