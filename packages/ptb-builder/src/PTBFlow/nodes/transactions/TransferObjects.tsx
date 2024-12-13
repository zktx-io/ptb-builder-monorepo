import React, { useCallback, useEffect } from 'react';

import { Transaction } from '@mysten/sui/transactions';

import { CodeParam, PTBNode, PTBNodeProp, PTBNodeType } from '..';
import { enqueueToast } from '../../../Provider/toastManager';
import { PtbHandle, PtbHandleArray, PtbHandleProcess } from '../handles';
import { NodeStyles } from '../styles';

export const TransferObjects = ({ data }: PTBNodeProp) => {
  const code = useCallback((params: CodeParam[]): string => {
    const args: (CodeParam | undefined)[] = [];
    args.push(params.find((item) => item.targetHandle === 'objects:object[]'));
    args.push(params.find((item) => item.targetHandle === 'address:address'));
    return `tx.transferObjects(${args.map((item) => (item ? item.name : 'undefined')).join(',')})`;
  }, []);

  const excute = useCallback(
    (
      transaction: Transaction,
      params: { source: PTBNode; target: string }[],
      results: { id: string; value: any }[],
    ): { transaction: Transaction; result: any } | undefined => {
      let address;
      const objects = [];

      const addressNode = params.find(
        (item) => item.target === 'address:address',
      );
      if (addressNode) {
        if (addressNode.source.type === PTBNodeType.Address) {
          address = addressNode.source.data.value as string;
        } else {
          // TODO
          enqueueToast(`not support - ${addressNode.source.type}`, {
            variant: 'warning',
          });
        }
      }

      const inputs = params.find((item) => item.target === 'objects:object[]');
      if (inputs) {
        if (inputs.source.type === PTBNodeType.ObjectArray) {
          objects.push(
            ...(inputs.source.data.value as string[]).map((item) =>
              transaction.object(item),
            ),
          );
        } else if (inputs.source.type === PTBNodeType.SplitCoins) {
          const temp = results.find((item) => item.id === inputs.source.id);
          temp && objects.push(...temp.value);
        } else {
          // TODO
          enqueueToast(`not support - ${inputs.source.type}`, {
            variant: 'warning',
          });
        }
      }

      if (address && objects.length > 0) {
        const result = transaction.transferObjects(objects, address);
        return { transaction, result };
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
      <PtbHandleArray
        typeHandle="target"
        typeParams="object[]"
        name="objects"
        style={{ left: '35%' }}
      />
      <PtbHandle
        typeHandle="target"
        typeParams="address"
        name="address"
        style={{ left: '65%' }}
      />
      <PtbHandleProcess typeHandle="target" />
      <PtbHandleProcess typeHandle="source" />
    </div>
  );
};
