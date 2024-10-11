import React, { useCallback, useEffect } from 'react';

import { type NodeProp } from '..';
import { PtbHandle, PtbHandleArray, PtbHandleProcess } from '../handles';
import { NodeStyles } from '../styles';
import { CodeParam } from '../types';

export const MergeCoins = ({ id, data }: NodeProp) => {
  const code = useCallback((params: CodeParam[]): string => {
    const args: (CodeParam | undefined)[] = [];
    args.push(
      params.find((item) => item.targetHandle === 'destination:object'),
    );
    args.push(params.find((item) => item.targetHandle === 'source:object[]'));
    return `tx.mergeCoins(${args.map((item) => (item ? item.name : 'undefined')).join(',')})`;
  }, []);

  useEffect(() => {
    if (data) {
      data.code = code;
    }
  }, [code, data]);

  return (
    <div className={NodeStyles.transaction}>
      <p className="text-base text-center text-gray-700 dark:text-gray-400">
        MergeCoins
      </p>
      <PtbHandle
        typeHandle="target"
        typeParams="object"
        name="destination"
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
