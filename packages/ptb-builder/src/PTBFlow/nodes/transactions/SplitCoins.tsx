import React, { useCallback, useEffect } from 'react';

import { Transaction } from '@mysten/sui/transactions';

import { CodeParam, PTBNode, PTBNodeProp } from '..';
import { enqueueToast } from '../../../Provider/toastManager';
import { PtbHandle, PtbHandleArray, PtbHandleProcess } from '../handles';
import { NodeStyles } from '../styles';

export const SplitCoins = ({ data }: PTBNodeProp) => {
  const code = useCallback((params: CodeParam[]): string => {
    const args: (CodeParam | undefined)[] = [];
    args.push(params.find((item) => item.targetHandle === 'coin:object'));
    args.push(params.find((item) => item.targetHandle === 'amounts:number[]'));
    return `tx.splitCoins(${args.map((item) => (item ? item.name : 'undefined')).join(',')})`;
  }, []);

  const excute = useCallback(
    (
      transaction: Transaction,
      params: { source: PTBNode; target: string }[],
      results: { id: string; value: any }[],
    ): { transaction: Transaction; result: any } | undefined => {
      let coin;
      const amounts: number[] = [];

      const coinObject = params.find((item) => item.target === 'coin:object');
      if (coinObject) {
        if (coinObject.source.type === 'SuiObjectGas') {
          coin = transaction.gas;
        } else if (coinObject.source.type === 'SuiObject') {
          coin = transaction.object(coinObject.source.data.value as string);
        } else {
          // TODO
          enqueueToast(`not support - ${coinObject.source.type}`, {
            variant: 'warning',
          });
        }
      }
      const inputs = params.find((item) => item.target === 'amounts:number[]');
      if (inputs) {
        if (inputs.source.type === 'SuiNumberArray') {
          amounts.push(...(inputs.source.data.value as number[]));
        } else {
          // TODO
          enqueueToast(`not support - ${inputs.source.type}`, {
            variant: 'warning',
          });
        }
      }

      if (coin && amounts.length > 0) {
        const temp = transaction.splitCoins(coin, amounts);
        return { transaction, result: amounts.map((_, i) => temp[i]) };
      }
      return undefined;
    },
    [],
  );

  useEffect(() => {
    if (data) {
      data.code = code;
      data.excute = excute;
    }
  }, [code, data, excute]);

  return (
    <div className={NodeStyles.transaction}>
      <p className="text-base text-center text-gray-700 dark:text-gray-400">
        {data.label}
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
