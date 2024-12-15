import React, { useCallback, useEffect } from 'react';

import { PTBEdge, PTBNodeProp } from '..';
import { PtbHandleArray, PtbHandleProcess } from '../handles';
import { NodeStyles } from '../styles';

export const Publish = ({ data }: PTBNodeProp) => {
  const code = useCallback(
    (dictionary: Record<string, string>, edges: PTBEdge[]): string => {
      return '';
    },
    [],
  );

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
      <PtbHandleArray typeHandle="source" typeParams="object[]" name="result" />
      <PtbHandleProcess typeHandle="target" />
      <PtbHandleProcess typeHandle="source" />
    </div>
  );
};
