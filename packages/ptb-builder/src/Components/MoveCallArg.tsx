import React, { useEffect, useRef, useState } from 'react';

import { PtbHandle, PtbHandleVector } from '../PTBFlow/nodes/handles';
import { FormStyle, InputStyle, LabelStyle } from '../PTBFlow/nodes/styles';
import { PREFIX } from '../utilities/getMoveCallFuncArg';

export interface FuncArg {
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
      ) : arg.type === 'vector<u8>' ||
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
