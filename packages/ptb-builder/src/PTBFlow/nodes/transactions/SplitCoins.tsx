import React, { useCallback, useEffect } from 'react';

import { type NodeProp } from '..';
import { PtbHandle, PtbHandleArray, PtbHandleProcess } from '../handles';
import { NodeStyles } from '../styles';
import { CodeParam } from '../types';

export const SplitCoins = ({ id, data }: NodeProp) => {
  const code = useCallback((params: CodeParam[]): string => {
    const args: (CodeParam | undefined)[] = [];
    args.push(params.find((item) => item.targetHandle === 'coin:object'));
    args.push(params.find((item) => item.targetHandle === 'amounts:number[]'));
    return `tx.splitCoins(${args.map((item) => (item ? item.name : 'undefined')).join(',')})`;
  }, []);

  useEffect(() => {
    if (data) {
      data.code = code;
    }
  }, [code, data]);

  return (
    <div className={NodeStyles.transaction}>
      <p className="text-base text-center text-gray-700 dark:text-gray-400">
        SplitCoins
      </p>
      <PtbHandle
        typeHandle="target"
        typeParams="object"
        name="coin"
        style={{ left: '35%' }}
      />
      <PtbHandleArray
        typeHandle="target"
        typeParams="number[]"
        name="amounts"
        style={{ left: '65%' }}
      />
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
