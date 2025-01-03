import React from 'react';

import { PTBNodeProp } from '..';
import { PtbHandleProcess } from '../handles';
import { NodeStyles } from '../styles';

export const End = ({ id, data }: PTBNodeProp) => {
  return (
    <div className={NodeStyles.startEnd}>
      <p className="text-base text-center text-gray-700 dark:text-gray-400">
        End
      </p>
      <PtbHandleProcess typeHandle="target" />
    </div>
  );
};
