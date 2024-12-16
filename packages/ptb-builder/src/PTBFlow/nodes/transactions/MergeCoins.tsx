import React, { useCallback, useEffect, useRef } from 'react';

import { Transaction } from '@mysten/sui/transactions';
import { useReactFlow, useUpdateNodeInternals } from '@xyflow/react';

import { PTBEdge, PTBNode, PTBNodeProp, PTBNodeType } from '..';
import { TxsArgs, TxsArgsHandles } from '../../../components';
import { enqueueToast } from '../../../provider';
import { PtbHandleProcess } from '../handles';
import { NodeStyles } from '../styles';

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
  /*
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
  */

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
      // data.excute = excute;
    }
  }, [code, data]);

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
