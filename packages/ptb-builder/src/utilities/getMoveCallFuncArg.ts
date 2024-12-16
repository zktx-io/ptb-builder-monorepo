import { SuiMoveNormalizedType } from '@mysten/sui/client';

import { FuncArg } from '../ptbFlow/components';

const numericTypes = new Set(['U8', 'U16', 'U32', 'U64', 'U128', 'U256']);
const objectTypes = new Set(['Reference', 'MutableReference', 'Struct']);

const getTypeName = (paramType: SuiMoveNormalizedType): string => {
  if (typeof paramType === 'string') {
    return paramType;
  }

  if (typeof paramType === 'object' && 'Struct' in paramType) {
    const struct = paramType.Struct;
    const typeArgs = struct.typeArguments
      .map((arg) => getTypeName(arg))
      .join(', ');
    return `${struct.address}::${struct.module}::${struct.name}${typeArgs && `<${typeArgs}>`}`;
  }

  if (typeof paramType === 'object' && 'Vector' in paramType) {
    return `Vector<${getTypeName(paramType.Vector)}>`;
  }

  if (typeof paramType === 'object' && 'TypeParameter' in paramType) {
    return `TypeParameter ${paramType.TypeParameter}`;
  }

  if (typeof paramType === 'object' && 'Reference' in paramType) {
    return `${getTypeName(paramType.Reference)}`;
  }

  if (typeof paramType === 'object' && 'MutableReference' in paramType) {
    return `${getTypeName(paramType.MutableReference)}`;
  }

  return 'Unknown Type';
};

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
      type:
        typeof item.Vector === 'object' && 'Struct' in item.Vector
          ? (`vector<object>`.toLowerCase() as any) // TODO: fix this
          : (`vector<${item.Vector}>`.toLowerCase() as any),
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
