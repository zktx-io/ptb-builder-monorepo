import React, { useCallback, useEffect, useRef } from 'react';

import { Transaction } from '@mysten/sui/transactions';
import { useReactFlow, useUpdateNodeInternals } from '@xyflow/react';

import { PTBEdge, PTBNode, PTBNodeProp, PTBNodeType } from '..';
import { TxsArgs, TxsArgsHandles } from '../../../Components/TxsArgs';
import { enqueueToast } from '../../../provider';
import { PtbHandleProcess } from '../handles';
import { NodeStyles } from '../styles';

export const TransferObjects = ({ id, data }: PTBNodeProp) => {
  const updateNodeInternals = useUpdateNodeInternals();
  const { setEdges } = useReactFlow();
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

  /*
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
  */

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
      // data.excute = excute;
    }
  }, [code, data]);

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
