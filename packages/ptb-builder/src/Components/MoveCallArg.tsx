import React from 'react';

import {
  PtbHandle,
  PtbHandleArray,
  PtbHandleVector,
} from '../PTBFlow/nodes/handles';
import { TYPE_ARRAY, TYPE_PARAMS, TYPE_VECTOR } from '../PTBFlow/nodes/isType';
import { FormStyle, InputStyle, LabelStyle } from '../PTBFlow/nodes/styles';
import { PREFIX } from '../utilities/getMoveCallFuncArg';

export interface FuncArg {
  id: string;
  type: TYPE_PARAMS | TYPE_ARRAY | TYPE_VECTOR | undefined;
  placeHolder: string;
  value: string;
}

export const MoveCallArg = ({
  arg,
  index,
  yPosition,
  typeHandle,
  node,
}: {
  arg: FuncArg;
  index: number;
  yPosition: number;
  typeHandle: 'source' | 'target';
  node: 'transactions' | 'inputs';
}) => {
  return (
    <div className={FormStyle}>
      <label
        className={LabelStyle}
        style={{ fontSize: '0.6rem' }}
      >{`Arg ${index}`}</label>
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
          node={node}
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
          node={node}
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
          node={node}
          name={`${PREFIX}${index}`}
          style={{ top: `${yPosition + index * 42}px` }}
        />
      ) : (
        <></>
      )}
    </div>
  );
};
