import React from 'react';

import { SuiMoveAbilitySet, SuiMoveNormalizedType } from '@mysten/sui/client';

import { PtbHandle, PtbHandleArray, PtbHandleVector } from '../nodes/handles';
import { PtbHandleNA } from '../nodes/handles/PtbHandleNA';
import {
  NumericTypes,
  TYPE_ARRAY,
  TYPE_PARAMS,
  TYPE_VECTOR,
} from '../nodes/types';

type TYPE = TYPE_PARAMS | TYPE_ARRAY | TYPE_VECTOR | 'number' | 'number[]';
export interface Handle {
  id: string;
  placeholder: string;
  type?: TYPE;
}

const YStart = 185;
const YGap = 24;

export const convertParams = (
  typeHandle: 'source' | 'target',
  prefix: string,
  params: SuiMoveNormalizedType[],
  typeArgs: string[],
): Handle[] => {
  if (params.length > 1 || typeHandle === 'target') {
    return params.map((item, i) => {
      const id = `${prefix}[${i}]`;
      return { id, ...getTypeName(item, typeArgs) };
    });
  }
  return [{ id: prefix, ...getTypeName(params[0], typeArgs) }];
};

export const getTypeName = (
  paramType: SuiMoveNormalizedType,
  typeArgs: string[],
): { placeholder: string; type?: TYPE } => {
  if (typeof paramType === 'string') {
    const temp = paramType.toLowerCase();
    return {
      placeholder: paramType,
      type: (NumericTypes.has(temp) ? 'number' : temp) as any,
    };
  }

  if (typeof paramType === 'object' && 'Struct' in paramType) {
    const struct = paramType.Struct;
    const placeholder = struct.typeArguments
      .map((param) => getTypeName(param, typeArgs).placeholder)
      .join(',');

    let type: TYPE | undefined = undefined;
    switch (`${struct.address}::${struct.module}::${struct.name}`) {
      case '0x1::option::Option':
        if (
          typeof struct.typeArguments[0] === 'object' &&
          'TypeParameter' in struct.typeArguments[0]
        ) {
          type = typeArgs[struct.typeArguments[0].TypeParameter] as TYPE_PARAMS;
        } else if (
          typeof struct.typeArguments[0] === 'object' &&
          'Struct' in struct.typeArguments[0]
        ) {
          type = getTypeName(struct.typeArguments[0], typeArgs).type;
        } else {
          type = (
            struct.typeArguments[0] as string
          ).toLowerCase() as TYPE_PARAMS;
        }
        break;
      default:
        type = 'object';
        break;
    }
    return {
      placeholder: `${struct.address}::${struct.module}::${struct.name}${placeholder && `<${placeholder}>`}`,
      type,
    };
  }

  if (typeof paramType === 'object' && 'TypeParameter' in paramType) {
    return {
      placeholder: `T${paramType.TypeParameter}`,
      // type: type as TYPE, // this is correct for input params
    };
  }

  if (typeof paramType === 'object' && 'Reference' in paramType) {
    return getTypeName(paramType.Reference, typeArgs);
  }

  if (typeof paramType === 'object' && 'MutableReference' in paramType) {
    return getTypeName(paramType.MutableReference, typeArgs);
  }

  if (typeof paramType === 'object' && 'Vector' in paramType) {
    const { placeholder, type } = getTypeName(paramType.Vector, typeArgs);
    return {
      placeholder: `Vector<${placeholder}>`,
      type: (type === 'number'
        ? `vector<${placeholder.toLowerCase()}>`
        : `vector<${type}>`) as any,
    };
  }

  return {
    placeholder: 'Unknown Type',
  };
};

interface CmdParamsMoveCallProps {
  typeHandle: 'source' | 'target';
  types: SuiMoveAbilitySet[];
  params: Handle[];
}

export const CmdParamsMoveCall = ({
  typeHandle,
  types,
  params,
}: CmdParamsMoveCallProps) => {
  return (
    <>
      {types.map((item, index) => (
        <PtbHandle
          key={`T${index}`}
          label={`T${index}`}
          tootlip={item.abilities.join(',')}
          name={`type[${index}]`}
          typeHandle="target"
          typeParams="string"
          style={{ top: `${YStart + index * 24}px` }}
        />
      ))}
      {params.map((item, index) => {
        const top = `${YStart + (index + types.length) * YGap}px`;
        switch (item.type) {
          case 'address':
          case 'bool':
          case 'object':
          case 'number':
            return (
              <PtbHandle
                key={index}
                label={item.id}
                tootlip={item.placeholder}
                name={item.id}
                typeHandle={typeHandle}
                typeParams={item.type}
                style={{ top }}
              />
            );
          case 'address[]':
          case 'bool[]':
          case 'object[]':
          case 'number[]':
            return (
              <PtbHandleArray
                key={index}
                label={item.id}
                tootlip={item.placeholder}
                name={item.id}
                typeHandle={typeHandle}
                typeParams={item.type}
                style={{ top }}
              />
            );
          case 'vector<address>':
          case 'vector<bool>':
          case 'vector<object>':
          case 'vector<u8>':
          case 'vector<u16>':
          case 'vector<u32>':
          case 'vector<u64>':
          case 'vector<u128>':
          case 'vector<u256>':
            return (
              <PtbHandleVector
                key={index}
                label={item.id}
                tootlip={item.placeholder}
                name={item.id}
                typeHandle={typeHandle}
                typeParams={item.type}
                style={{ top }}
              />
            );
          default:
            return (
              <PtbHandleNA
                key={index}
                label={item.id}
                tootlip={item.placeholder}
                name={item.id}
                typeHandle={typeHandle}
                style={{ top }}
              />
            );
        }
      })}
    </>
  );
};
