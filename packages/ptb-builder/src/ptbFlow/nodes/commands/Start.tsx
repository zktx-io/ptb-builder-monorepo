import React from 'react';

import { PTBNodeProp } from '..';
import { PtbHandleProcess } from '../handles';
import { NodeStyles } from '../styles';

export const Start = ({ id, data }: PTBNodeProp) => {
  return (
    <div className={NodeStyles.startEnd}>
      <p className="text-base text-center text-gray-700 dark:text-gray-400">
        Start
      </p>
      <PtbHandleProcess typeHandle="source" />
    </div>
  );
};
