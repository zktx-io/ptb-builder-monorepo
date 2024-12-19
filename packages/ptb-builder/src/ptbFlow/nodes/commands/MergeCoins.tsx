import React, { useCallback, useEffect, useRef } from 'react';

import {
  Transaction,
  TransactionObjectArgument,
} from '@mysten/sui/transactions';
import { useReactFlow, useUpdateNodeInternals } from '@xyflow/react';

import { PTBEdge, PTBNode, PTBNodeProp, PTBNodeType } from '..';
import { enqueueToast } from '../../../provider';
import { TxsArgs, TxsArgsHandles } from '../../components';
import { PtbHandleProcess } from '../handles';
import { extractIndex } from '../isType';
import { NodeStyles } from '../styles';
import { PTBNestedResult } from '../types';

export const MergeCoins = ({ id, data }: PTBNodeProp) => {
  const updateNodeInternals = useUpdateNodeInternals();
  const { setEdges } = useReactFlow();
  // eslint-disable-next-line no-restricted-syntax
  const txsArgsRef = useRef<TxsArgsHandles>(null);

  const code = useCallback(
    (dictionary: Record<string, string>, edges: PTBEdge[]): string => {
      if (txsArgsRef.current) {
        const args = txsArgsRef.current.getArgs(dictionary, edges);
        const destinationCoin = args.arg1;
        const sourceCoins = Array.isArray(args.arg2)
          ? `[${args.arg2.join(',')}]`
          : args.arg2;
        return `tx.mergeCoins(${destinationCoin}, ${sourceCoins})`;
      }
      return 'tx.mergeCoins(undefined, undefined)';
    },
    [],
  );

  const excute = useCallback(
    (
      transaction: Transaction,
      params: { [key: string]: { node: PTBNode; edge: PTBEdge } },
      results: { [key: string]: PTBNestedResult[] },
    ): { transaction: Transaction; results?: PTBNestedResult[] } => {
      let destination;
      let sources: (TransactionObjectArgument | string | undefined)[] = [];

      if (params['destination:object']) {
        const source = params['destination:object'];
        const index = extractIndex(source.edge.sourceHandle!);
        switch (source.node.type) {
          case PTBNodeType.ObjectGas:
            destination = transaction.gas;
            break;
          case PTBNodeType.Object:
            destination = source.node.data.value as string;
            break;
          case PTBNodeType.ObjectArray:
            if (Array.isArray(source.node.data.value) && index !== undefined) {
              destination = source.node.data.value[index] as string;
            }
            break;
          case PTBNodeType.SplitCoins:
          case PTBNodeType.MoveCall:
            if (index !== undefined) {
              destination = results[source.node.id][index];
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
        sources = [];
        switch (source.node.type) {
          case PTBNodeType.ObjectArray:
            sources.push(
              ...(source.node.data.value as string[]).map((item) =>
                transaction.object(item),
              ),
            );
            break;
          case PTBNodeType.SplitCoins:
            const result = results[source.node.id];
            if (result) {
              sources.push(...result);
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
        sources = new Array(sources.length).fill(undefined);
        temp.forEach((source) => {
          const target = extractIndex(source.edge.targetHandle!);
          const origin = extractIndex(source.edge.sourceHandle!);
          switch (source.node.type) {
            case PTBNodeType.Object:
              if (
                target !== undefined &&
                !Array.isArray(source.node.data.value)
              ) {
                sources[target] = transaction.object(
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
                sources[target] = transaction.object(
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
                sources[target] = result[origin];
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
        destination &&
        sources.length > 0 &&
        !sources.some((element) => element === undefined)
      ) {
        transaction.mergeCoins(destination, sources as any[]);
        return { transaction, results: undefined };
      }
      throw new Error('Method not implemented.');
    },
    [],
  );

  const resetEdge = () => {
    setEdges((eds) =>
      eds.filter(
        (edge) =>
          !(
            (edge.target === id || edge.source === id) &&
            edge.type === 'Data' &&
            edge.targetHandle !== 'destination:object'
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
        MergeCoins
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
        input1={{ label: 'destination', type: 'object' }}
        input2={{ label: 'source', type: 'object[]' }}
        resetEdge={resetEdge}
      />
    </div>
  );
};
