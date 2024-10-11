import React, { useCallback, useEffect } from 'react';

import { type NodeProp } from '..';
import { PtbHandleArray, PtbHandleProcess } from '../handles';
import { NodeStyles } from '../styles';
import { CodeParam } from '../types';

export const Publish = ({ id, data }: NodeProp) => {
  const code = useCallback((_params: CodeParam[]): string => {
    return '';
  }, []);

  useEffect(() => {
    if (data) {
      data.code = code;
    }
  }, [code, data]);

  return (
    <div className={NodeStyles.transaction}>
      <p className="text-base text-center text-gray-700 dark:text-gray-400">
        Publish
      </p>
      <PtbHandleArray
        typeHandle="source"
        typeParams="object[]"
        name="result"
        node="transactions"
      />
      <PtbHandleProcess typeHandle="target" />
      <PtbHandleProcess typeHandle="source" />
    </div>
  );
};
