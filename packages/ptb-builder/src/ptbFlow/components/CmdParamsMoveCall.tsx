import React, { useEffect } from 'react';

import { SuiMoveAbilitySet, SuiMoveNormalizedType } from '@mysten/sui/client';

import { PtbHandle, PtbHandleArray, PtbHandleVector } from '../nodes/handles';
import { FormStyle, InputStyle, LabelStyle } from '../nodes/styles';
import {
  NumericTypes,
  TYPE_ARRAY,
  TYPE_PARAMS,
  TYPE_VECTOR,
} from '../nodes/types';

type TYPE = TYPE_PARAMS | TYPE_ARRAY | TYPE_VECTOR | 'number' | 'number[]';
interface Handle {
  id: string;
  placeholder: string;
  type?: TYPE;
}

export const getTypeName = (
  paramType: SuiMoveNormalizedType,
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
    const typeArgs = struct.typeArguments
      .map((param) => getTypeName(param).placeholder)
      .join(',');
    return {
      placeholder: `${struct.address}::${struct.module}::${struct.name}${typeArgs && `<${typeArgs}>`}`,
      type: 'object',
    };
  }

  if (typeof paramType === 'object' && 'TypeParameter' in paramType) {
    return { placeholder: `T${paramType.TypeParameter}`, type: 'object' }; // this is correct for input params
  }

  if (typeof paramType === 'object' && 'Reference' in paramType) {
    return getTypeName(paramType.Reference);
  }

  if (typeof paramType === 'object' && 'MutableReference' in paramType) {
    return getTypeName(paramType.MutableReference);
  }

  if (typeof paramType === 'object' && 'Vector' in paramType) {
    const { placeholder, type } = getTypeName(paramType.Vector);
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
  label: string;
  prefix: string;
  typeHandle: 'source' | 'target';
  types: SuiMoveAbilitySet[];
  params: SuiMoveNormalizedType[];
  yPosition: number;
}

export const CmdParamsMoveCall = ({
  label,
  prefix,
  typeHandle,
  types,
  params,
  yPosition,
}: CmdParamsMoveCallProps) => {
  const [handles, setHandles] = React.useState<Handle[]>([]);

  useEffect(() => {
    setHandles(
      params.map((item, i) => {
        const id = `${prefix}[${i}]`;
        return { id, ...getTypeName(item) };
      }),
    );
  }, [params, prefix]);

  return (
    <>
      {types.map((_, index) => (
        <div key={index} className={FormStyle}>
          <label
            className={LabelStyle}
            style={{ fontSize: '0.6rem' }}
          >{`Type${index}`}</label>
          <input
            readOnly
            type="text"
            placeholder={`T${index}`}
            autoComplete="off"
            className={InputStyle}
          />
          <PtbHandle
            typeHandle="target"
            typeParams="string"
            name={`type[${index}]`}
            style={{ top: `${yPosition + index * 42}px` }}
          />
        </div>
      ))}
      {handles.map((item, index) => {
        let handleComponent;
        switch (item.type) {
          case 'address':
          case 'bool':
          case 'object':
          case 'number':
            handleComponent = (
              <PtbHandle
                typeHandle={typeHandle}
                typeParams={item.type}
                name={item.id}
                style={{ top: `${yPosition + (index + types.length) * 42}px` }}
              />
            );
            break;
          case 'address[]':
          case 'bool[]':
          case 'object[]':
          case 'number[]':
            handleComponent = (
              <PtbHandleArray
                typeHandle={typeHandle}
                typeParams={item.type}
                name={item.id}
                style={{ top: `${yPosition + (index + types.length) * 42}px` }}
              />
            );
            break;
          case 'vector<address>':
          case 'vector<bool>':
          case 'vector<object>':
          case 'vector<u8>':
          case 'vector<u16>':
          case 'vector<u32>':
          case 'vector<u64>':
          case 'vector<u128>':
          case 'vector<u256>':
            handleComponent = (
              <PtbHandleVector
                typeHandle={typeHandle}
                typeParams={item.type}
                name={item.id}
                style={{ top: `${yPosition + (index + types.length) * 42}px` }}
              />
            );
            break;
          default:
            handleComponent = <></>;
            break;
        }
        return (
          <div key={index} className={FormStyle}>
            <label
              className={LabelStyle}
              style={{ fontSize: '0.6rem' }}
            >{`${label}${index}`}</label>
            <input
              readOnly
              type="text"
              placeholder={item.placeholder}
              autoComplete="off"
              className={InputStyle}
            />
            {handleComponent}
          </div>
        );
      })}
    </>
  );
};
