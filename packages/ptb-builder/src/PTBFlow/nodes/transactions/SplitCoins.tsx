import React, { useCallback, useEffect, useRef } from 'react';

import { Transaction } from '@mysten/sui/transactions';
import { useReactFlow, useUpdateNodeInternals } from '@xyflow/react';

import { PTBEdge, PTBNode, PTBNodeProp, PTBNodeType } from '..';
import { TxsArgs, TxsArgsHandles } from '../../../components';
import { enqueueToast } from '../../../provider';
import { PtbHandleProcess } from '../handles';
import { NodeStyles } from '../styles';

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
  /*
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
        if (coinObject.source.type === PTBNodeType.ObjectGas) {
          coin = transaction.gas;
        } else if (coinObject.source.type === PTBNodeType.Object) {
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
        if (inputs.source.type === PTBNodeType.NumberArray) {
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
  */
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
      // data.excute = excute;
    }
  }, [code, data]);

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
