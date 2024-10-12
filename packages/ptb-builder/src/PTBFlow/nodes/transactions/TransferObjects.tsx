import React, { useCallback, useEffect } from 'react';

import { Transaction } from '@mysten/sui/transactions';
import { Node } from '@xyflow/react';

import { type NodeProp } from '..';
import { PtbHandle, PtbHandleArray, PtbHandleProcess } from '../handles';
import { NodeStyles } from '../styles';
import { CodeParam } from '../types';

export const TransferObjects = ({ id, data }: NodeProp) => {
  const code = useCallback((params: CodeParam[]): string => {
    const args: (CodeParam | undefined)[] = [];
    args.push(params.find((item) => item.targetHandle === 'objects:object[]'));
    args.push(params.find((item) => item.targetHandle === 'address:address'));
    return `tx.transferObjects(${args.map((item) => (item ? item.name : 'undefined')).join(',')})`;
  }, []);

  const excute = useCallback(
    (
      transaction: Transaction,
      params: { source: Node; target: string }[],
      results: { id: string; value: any }[],
    ): { transaction: Transaction; result: any } | undefined => {
      let address;
      const objects = [];

      const addressNode = params.find(
        (item) => item.target === 'address:address',
      );
      if (addressNode) {
        if (addressNode.source.type === 'SuiAddress') {
          address = addressNode.source.data.value as string;
        } else {
          // TODO
        }
      }

      const inputs = params.find((item) => item.target === 'objects:object[]');
      if (inputs) {
        if (inputs.source.type === 'SuiObjectArray') {
          objects.push(
            ...(inputs.source.data.value as string[]).map((item) =>
              transaction.object(item),
            ),
          );
        } else if (inputs.source.type === 'SplitCoins') {
          const temp = results.find((item) => item.id === inputs.source.id);
          temp && objects.push(temp.value);
        } else {
          // TODO
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
        TransferObjects
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
