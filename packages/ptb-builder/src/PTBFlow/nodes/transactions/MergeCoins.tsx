import React, { useCallback, useEffect } from 'react';

import { Transaction } from '@mysten/sui/transactions';

import { CodeParam, PTBNode, PTBNodeProp, PTBNodeType } from '..';
import { enqueueToast } from '../../../Provider/toastManager';
import { PtbHandle, PtbHandleArray, PtbHandleProcess } from '../handles';
import { NodeStyles } from '../styles';

export const MergeCoins = ({ data }: PTBNodeProp) => {
  const code = useCallback((params: CodeParam[]): string => {
    const args: (CodeParam | undefined)[] = [];
    args.push(
      params.find((item) => item.targetHandle === 'destination:object'),
    );
    args.push(params.find((item) => item.targetHandle === 'source:object[]'));
    return `tx.mergeCoins(${args.map((item) => (item ? item.name : 'undefined')).join(',')})`;
  }, []);

  const excute = useCallback(
    (
      transaction: Transaction,
      params: { source: PTBNode; target: string }[],
      results: { id: string; value: any }[],
    ): { transaction: Transaction; result: any } | undefined => {
      let destination;
      const sources = [];

      const destNode = params.find(
        (item) => item.target === 'destination:object',
      );
      if (destNode) {
        if (destNode.source.type === PTBNodeType.ObjectGas) {
          destination = transaction.gas;
        } else if (destNode.source.type === PTBNodeType.Object) {
          destination = destNode.source.data.value as string;
        } else {
          // TODO
          enqueueToast(`not support - ${destNode.source.type}`, {
            variant: 'warning',
          });
        }
      }

      const inputs = params.find((item) => item.target === 'source:object[]');
      if (inputs) {
        if (inputs.source.type === PTBNodeType.ObjectArray) {
          sources.push(
            ...(inputs.source.data.value as string[]).map((item) =>
              transaction.object(item),
            ),
          );
        } else if (inputs.source.type === PTBNodeType.SplitCoins) {
          const temp = results.find((item) => item.id === inputs.source.id);
          temp && sources.push(...temp.value);
        } else {
          // TODO
          enqueueToast(`not support - ${inputs.source.type}`, {
            variant: 'warning',
          });
        }
      }

      if (destination && sources.length > 0) {
        const result = transaction.mergeCoins(destination, sources);
        return { transaction, result: undefined };
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
