import React from 'react';

import { PREFIX } from './getMoveCallFuncArg';
import {
  PtbHandle,
  PtbHandleArray,
  PtbHandleVector,
} from '../../ptbFlow/nodes/handles';
import { FormStyle, InputStyle, LabelStyle } from '../../ptbFlow/nodes/styles';
import {
  TYPE_ARRAY,
  TYPE_PARAMS,
  TYPE_VECTOR,
} from '../../ptbFlow/nodes/types';

export interface FuncArg {
  id: string;
  type: TYPE_PARAMS | TYPE_ARRAY | TYPE_VECTOR | undefined;
  placeHolder: string;
  value: string;
}

export const MoveCallArgs = ({
  prefix,
  typeHandle,
  args,
  yPosition,
}: {
  prefix: string;
  typeHandle: 'source' | 'target';
  args: FuncArg[];
  yPosition: number;
}) => {
  return (
    <>
      {args.map((arg, index) => (
        <div key={index} className={FormStyle}>
          <label
            className={LabelStyle}
            style={{ fontSize: '0.6rem' }}
          >{`${prefix} ${index}`}</label>
          <input
            type="text"
            readOnly
            placeholder={arg.placeHolder}
            autoComplete="off"
            className={InputStyle}
            value={arg.value}
          />
          {arg.type === 'address' ||
          arg.type === 'bool' ||
          arg.type === 'object' ||
          arg.type === 'number' ? (
            <PtbHandle
              typeHandle={typeHandle}
              typeParams={arg.type}
              name={`${PREFIX}${index}`}
              style={{ top: `${yPosition + index * 42}px` }}
            />
          ) : arg.type === 'address[]' ||
            arg.type === 'bool[]' ||
            arg.type === 'object[]' ||
            arg.type === 'number[]' ? (
            <PtbHandleArray
              typeHandle={typeHandle}
              typeParams={arg.type}
              name={`${PREFIX}${index}`}
              style={{ top: `${yPosition + index * 42}px` }}
            />
          ) : arg.type === 'vector<object>' ||
            arg.type === 'vector<u8>' ||
            arg.type === 'vector<u16>' ||
            arg.type === 'vector<u32>' ||
            arg.type === 'vector<u64>' ||
            arg.type === 'vector<u128>' ||
            arg.type === 'vector<u256>' ? (
            <PtbHandleVector
              typeHandle={typeHandle}
              typeParams={arg.type}
              name={`${PREFIX}${index}`}
              style={{ top: `${yPosition + index * 42}px` }}
            />
          ) : (
            <></>
          )}
        </div>
      ))}
    </>
  );
};
