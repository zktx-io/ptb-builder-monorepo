import React from 'react';

import { PTBNodeProp } from '..';
import { PtbHandleArray, PtbHandleProcess } from '../handles';
import { NodeStyles } from '../styles';

export const Publish = ({ data }: PTBNodeProp) => {
  return (
    <div className={NodeStyles.command}>
      <p className="text-base text-center text-gray-700 dark:text-gray-400">
        Publish
      </p>
      <PtbHandleArray typeHandle="source" typeParams="object[]" name="result" />
      <PtbHandleProcess typeHandle="target" />
      <PtbHandleProcess typeHandle="source" />
    </div>
  );
};
