import React, { useCallback, useEffect, useRef } from 'react';

import { useReactFlow, useUpdateNodeInternals } from '@xyflow/react';

import { PTBEdge, PTBNodeProp } from '..';
import { TxsArgs, TxsArgsHandles } from '../../../Components/TxsArgs';
import { PtbHandleProcess } from '../handles';
import { NodeStyles } from '../styles';

export const MakeMoveVec = ({ id, data }: PTBNodeProp) => {
  const updateNodeInternals = useUpdateNodeInternals();
  const { setEdges } = useReactFlow();
  // eslint-disable-next-line no-restricted-syntax
  const txsArgsRef = useRef<TxsArgsHandles>(null);

  const code = useCallback(
    (dictionary: Record<string, string>, edges: PTBEdge[]): string => {
      if (txsArgsRef.current) {
        const args = txsArgsRef.current.getArgs(dictionary, edges);
        const type = args.arg1;
        const elements = Array.isArray(args.arg2)
          ? `[${args.arg2.join(',')}]`
          : args.arg2;
        return `tx.makeMoveVec({elements: ${elements}${type === 'undefined' ? '' : `, type: ${type}`}})`;
      }
      return 'tx.makeMoveVec({ elements: undefined })';
    },
    [],
  );

  const resetEdge = () => {
    setEdges((eds) =>
      eds.filter(
        (edge) =>
          !((edge.target === id || edge.source === id) && edge.type === 'Data'),
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
        MakeMoveVec
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
        input1={{ label: 'type', type: 'string' }}
        input2={{
          label: 'source',
          type: data.label
            .replace(/^vector<u(8|16|32|64|128|256)>$/, 'number[]')
            .replace(/^vector<(.+)>$/, '$1[]') as any,
        }}
        output={{ label: 'result', type: data.label as any }}
        resetEdge={resetEdge}
      />
    </div>
  );
};
