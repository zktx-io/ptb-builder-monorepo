import React, { useCallback, useEffect, useRef } from 'react';

import { Transaction } from '@mysten/sui/transactions';
import { useReactFlow, useUpdateNodeInternals } from '@xyflow/react';

import { PTBEdge, PTBNode, PTBNodeProp, PTBNodeType } from '..';
import { enqueueToast } from '../../../provider';
import { TxsArgs, TxsArgsHandles } from '../../components';
import { PtbHandleProcess } from '../handles';
import { extractIndex } from '../isType';
import { NodeStyles } from '../styles';
import { PTBNestedResult } from '../types';

export const SplitCoins = ({ id, data }: PTBNodeProp) => {
  const updateNodeInternals = useUpdateNodeInternals();
  const { setEdges } = useReactFlow();
  // eslint-disable-next-line no-restricted-syntax
  const txsArgsRef = useRef<TxsArgsHandles>(null);

  const code = useCallback(
    (dictionary: Record<string, string>, edges: PTBEdge[]): string => {
      if (txsArgsRef.current) {
        const args = txsArgsRef.current.getArgs(dictionary, edges);
        const coin = args.arg1;
        const amounts = Array.isArray(args.arg2)
          ? `[${args.arg2.join(',')}]`
          : args.arg2;
        return `tx.splitCoins(${coin}, ${amounts})`;
      }
      return 'tx.splitCoins(undefined, undefined)';
    },
    [],
  );

  const excute = useCallback(
    (
      transaction: Transaction,
      params: { [key: string]: { node: PTBNode; edge: PTBEdge } },
      results: { [key: string]: PTBNestedResult[] },
    ): { transaction: Transaction; results?: PTBNestedResult[] } => {
      let coin;
      let amounts: (number | undefined)[];

      if (params['coin:object']) {
        const source = params['coin:object'];
        const index = extractIndex(source.edge.sourceHandle!);
        switch (source.node.type) {
          case PTBNodeType.ObjectGas:
            coin = transaction.gas;
            break;
          case PTBNodeType.Object:
            coin = transaction.object(source.node.data.value as string);
            break;
          case PTBNodeType.ObjectArray:
            if (Array.isArray(source.node.data.value) && index !== undefined) {
              coin = transaction.object(
                source.node.data.value[index] as string,
              );
            }
            break;
          case PTBNodeType.SplitCoins:
          case PTBNodeType.MoveCall:
            if (index !== undefined) {
              coin = results[source.node.id][index];
            }
            break;
          default:
            enqueueToast(`not support (0) - ${source.node.type}`, {
              variant: 'warning',
            });
        }
      }

      if (params['amounts:number[]']) {
        const source = params['amounts:number[]'];
        amounts = [];
        switch (source.node.type) {
          case PTBNodeType.NumberArray:
            amounts.push(
              ...(source.node.data.value as number[]).map((item) => item),
            );
            break;
          default:
            enqueueToast(`not support (1) - ${source.node.type}`, {
              variant: 'warning',
            });
            break;
        }
      } else {
        const temp = Object.keys(params)
          .filter((key) => params[key].edge.targetHandle!.endsWith(':number'))
          .sort()
          .map((key) => params[key]);
        amounts = new Array(temp.length).fill(undefined);
        temp.forEach((source) => {
          const target = extractIndex(source.edge.targetHandle!);
          const origin = extractIndex(source.edge.sourceHandle!);
          switch (source.node.type) {
            case PTBNodeType.Number:
              if (
                target !== undefined &&
                !Array.isArray(source.node.data.value)
              ) {
                amounts[target] = source.node.data.value as number;
              }
              break;
            case PTBNodeType.NumberArray:
            case PTBNodeType.SplitCoins:
              if (
                target !== undefined &&
                origin !== undefined &&
                Array.isArray(source.node.data.value)
              ) {
                amounts[target] = source.node.data.value[origin] as number;
              }
              break;
            case PTBNodeType.MoveCall:
              const result = results[source.node.id];
              if (
                result !== undefined &&
                target !== undefined &&
                origin !== undefined
              ) {
                amounts[target] = result[origin] as unknown as number;
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
        coin &&
        amounts.length > 0 &&
        !amounts.some((element) => element === undefined)
      ) {
        const result = transaction.splitCoins(coin, amounts as number[]);
        return {
          transaction,
          results: amounts.map((_, index) => result[index]),
        };
      }
      throw new Error('Method not implemented.');
    },
    [],
  );

  const resetEdge = (handle: 'source' | 'target') => {
    setEdges((eds) =>
      eds.filter(
        (edge) =>
          !(
            ((edge.target === id && handle === 'target') ||
              (edge.source === id && handle === 'source')) &&
            edge.type === 'Data' &&
            edge.targetHandle !== 'coin:object'
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
        SplitCoins
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
        input1={{ label: 'coin', type: 'object' }}
        input2={{ label: 'amounts', type: 'number[]' }}
        output={{ label: 'result', type: 'object[]' }}
        resetEdge={resetEdge}
      />
    </div>
  );
};
