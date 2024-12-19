import React, { useCallback, useEffect, useRef } from 'react';

import {
  Transaction,
  TransactionObjectArgument,
} from '@mysten/sui/transactions';
import { useReactFlow, useUpdateNodeInternals } from '@xyflow/react';

import { PTBEdge, PTBNode, PTBNodeProp, PTBNodeType } from '..';
import { enqueueToast, useStateContext } from '../../../provider';
import { TxsArgs, TxsArgsHandles } from '../../components';
import { PtbHandleProcess } from '../handles';
import { extractIndex } from '../isType';
import { NodeStyles } from '../styles';
import { PTBNestedResult } from '../types';

export const TransferObjects = ({ id, data }: PTBNodeProp) => {
  const updateNodeInternals = useUpdateNodeInternals();
  const { setEdges } = useReactFlow();
  const { wallet } = useStateContext();
  // eslint-disable-next-line no-restricted-syntax
  const txsArgsRef = useRef<TxsArgsHandles>(null);

  const code = useCallback(
    (dictionary: Record<string, string>, edges: PTBEdge[]): string => {
      if (txsArgsRef.current) {
        const args = txsArgsRef.current.getArgs(dictionary, edges);
        const address = args.arg1;
        const objects = Array.isArray(args.arg2)
          ? `[${args.arg2.join(',')}]`
          : args.arg2;
        return `tx.transferObjects(${objects}, ${address})`;
      }
      return 'tx.transferObjects(undefined, undefined)';
    },
    [],
  );

  const excute = useCallback(
    (
      transaction: Transaction,
      params: { [key: string]: { node: PTBNode; edge: PTBEdge } },
      results: { [key: string]: PTBNestedResult[] },
    ): { transaction: Transaction; results?: PTBNestedResult[] } => {
      let address;
      let objects: (TransactionObjectArgument | string | undefined)[];

      if (params['address:address']) {
        const source = params['address:address'];
        const index = extractIndex(source.edge.sourceHandle!);
        switch (source.node.type) {
          case PTBNodeType.Address:
            address = source.node.data.value as string;
            break;
          case PTBNodeType.AddressWallet:
            address = wallet;
            break;
          case PTBNodeType.AddressArray:
            if (Array.isArray(source.node.data.value) && index !== undefined) {
              address = source.node.data.value[index] as string;
            }
            break;
          case PTBNodeType.MoveCall:
            if (index !== undefined) {
              address = results[source.node.id][index];
            }
            break;
          default:
            enqueueToast(`not support (0) - ${source.node.type}`, {
              variant: 'warning',
            });
        }
      }

      if (params['objects:object[]']) {
        const source = params['objects:object[]'];
        objects = [];
        switch (source.node.type) {
          case PTBNodeType.ObjectArray:
            objects.push(
              ...(source.node.data.value as string[]).map((item) =>
                transaction.object(item),
              ),
            );
            break;
          case PTBNodeType.SplitCoins:
            const result = results[source.node.id];
            if (result) {
              objects.push(...result);
            }
            break;
          default:
            enqueueToast(`not support (1) - ${source.node.type}`, {
              variant: 'warning',
            });
        }
      } else {
        const temp = Object.keys(params)
          .filter((key) => params[key].edge.targetHandle?.endsWith(':object'))
          .sort()
          .map((key) => params[key]);
        objects = new Array(temp.length).fill(undefined);
        temp.forEach((source) => {
          const target = extractIndex(source.edge.targetHandle!);
          const origin = extractIndex(source.edge.sourceHandle!);
          switch (source.node.type) {
            case PTBNodeType.Object:
              if (
                target !== undefined &&
                !Array.isArray(source.node.data.value)
              ) {
                objects[target] = transaction.object(
                  source.node.data.value as string,
                );
              }
              break;
            case PTBNodeType.ObjectArray:
              if (
                target !== undefined &&
                origin !== undefined &&
                Array.isArray(source.node.data.value)
              ) {
                objects[target] = transaction.object(
                  source.node.data.value[origin] as string,
                );
              }
              break;
            case PTBNodeType.SplitCoins:
            case PTBNodeType.MoveCall:
              const result = results[source.node.id];
              if (
                result !== undefined &&
                target !== undefined &&
                origin !== undefined
              ) {
                objects[target] = result[origin];
              }
              break;
            case PTBNodeType.ObjectGas:
              break;
            default:
              enqueueToast(`not support (3) - ${source.node.type}`, {
                variant: 'warning',
              });
              break;
          }
        });
      }

      if (
        address &&
        objects.length > 0 &&
        !objects.some((element) => element === undefined)
      ) {
        transaction.transferObjects(objects as any[], address);
        return { transaction, results: undefined };
      }
      throw new Error('Method not implemented.');
    },
    [wallet],
  );

  const resetEdge = () => {
    setEdges((eds) =>
      eds.filter(
        (edge) =>
          !(
            (edge.target === id || edge.source === id) &&
            edge.type === 'Data' &&
            edge.targetHandle !== 'address:address'
          ),
      ),
    );
  };

  useEffect(() => {
    updateNodeInternals(id);
  }, [id, updateNodeInternals]);

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
      <PtbHandleProcess
        typeHandle="target"
        style={{
          top: '24px',
        }}
      />
      <PtbHandleProcess
        typeHandle="source"
        style={{
          top: '24px',
        }}
      />
      <TxsArgs
        ref={txsArgsRef}
        input1={{ label: 'address', type: 'address' }}
        input2={{ label: 'objects', type: 'object[]' }}
        resetEdge={resetEdge}
      />
    </div>
  );
};
