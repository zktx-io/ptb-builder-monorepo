import React from 'react';

import { PTBNodeProp } from '..';
import { PtbHandleProcess } from '../handles';
import { NodeStyles } from '../styles';

export const Upgrade = ({ data }: PTBNodeProp) => {
  return (
    <div className={NodeStyles.command}>
      <p className="text-base text-center text-gray-700 dark:text-gray-400">
        Upgrade
      </p>
      <PtbHandleProcess typeHandle="target" />
      <PtbHandleProcess typeHandle="source" />
    </div>
  );
};
