import React from 'react';

import { PTBNodeProp } from '..';
import {
  PtbHandle,
  PtbHandleArray,
  PtbHandleProcess,
  PtbHandleVector,
} from '../handles';
import { NodeStyles } from '../styles';

export const MakeMoveVec = ({ id, data }: PTBNodeProp) => {
  return (
    <div className={NodeStyles.transaction}>
      <p className="text-base text-center text-gray-700 dark:text-gray-400">
        {data.label}
      </p>
      <PtbHandle
        typeHandle="target"
        typeParams="string"
        name="type"
        style={{ left: '35%' }}
      />
      <PtbHandleArray
        typeHandle="target"
        typeParams={
          data.label
            .replace(/^vector<u(8|16|32|64|128|256)>$/, 'number[]')
            .replace(/^vector<(.+)>$/, '$1[]') as any
        }
        name="source"
        style={{ left: '65%' }}
      />
      <PtbHandleVector
        typeHandle="source"
        typeParams={data.label as any}
        name="result"
        node="transactions"
      />
      <PtbHandleProcess typeHandle="target" />
      <PtbHandleProcess typeHandle="source" />
    </div>
  );
};
