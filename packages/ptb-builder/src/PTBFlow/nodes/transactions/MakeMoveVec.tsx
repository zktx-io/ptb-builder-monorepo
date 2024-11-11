import React from 'react';

import { type NodeProp } from '..';
import { PtbHandle, PtbHandleArray, PtbHandleProcess } from '../handles';
import { NodeStyles } from '../styles';

export const MakeMoveVec = ({ id, data }: NodeProp) => {
  return (
    <div className={NodeStyles.transaction}>
      <p className="text-base text-center text-gray-700 dark:text-gray-400">
        MakeMoveVec
      </p>
      <PtbHandle
        typeHandle="target"
        typeParams="string"
        name="type"
        style={{ left: '35%' }}
      />
      <PtbHandleArray
        typeHandle="target"
        typeParams="object[]"
        name="source"
        style={{ left: '65%' }}
      />
      <PtbHandleProcess typeHandle="target" />
      <PtbHandleProcess typeHandle="source" />
    </div>
  );
};
