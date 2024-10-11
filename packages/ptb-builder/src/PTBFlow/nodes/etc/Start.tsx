import React from 'react';

import { type NodeProp } from '..';
import { PtbHandleProcess } from '../handles';
import { NodeStyles } from '../styles';

export const Start = ({ id, data }: NodeProp) => {
  return (
    <div className={NodeStyles.process}>
      <p className="text-base text-center text-gray-700 dark:text-gray-400">
        Start
      </p>
      <PtbHandleProcess typeHandle="source" />
    </div>
  );
};
