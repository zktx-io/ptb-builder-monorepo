import React from 'react';

import { type NodeProp } from '..';
import { PtbHandleProcess } from '../handles';
import { NodeStyles } from '../styles';

export const End = ({ id, data }: NodeProp) => {
  return (
    <div className={NodeStyles.process}>
      <p className="text-base text-center text-gray-700 dark:text-gray-400">
        End
      </p>
      <PtbHandleProcess typeHandle="target" />
    </div>
  );
};
