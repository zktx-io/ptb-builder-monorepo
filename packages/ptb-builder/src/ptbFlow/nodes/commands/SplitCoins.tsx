import React from 'react';

import { useReactFlow } from '@xyflow/react';

import { PTBNodeProp } from '..';
import { CmdParamsSplitCoins } from '../../components';
import { PtbHandleProcess } from '../handles';
import { NodeStyles } from '../styles';

export const SplitCoins = ({ id, data }: PTBNodeProp) => {
  const { setEdges, setNodes } = useReactFlow();

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

  return (
    <div className={NodeStyles.command}>
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
      <CmdParamsSplitCoins
        id={id}
        input1={{ label: 'coin', type: 'object' }}
        input2={{ label: 'amounts', type: 'number[]' }}
        output={{ label: 'result', type: 'object[]' }}
        data={data}
        resetEdge={resetEdge}
        updateState={(
          splitInputs: number | undefined,
          splitOutputs: number | undefined,
        ) => {
          setNodes((nds) =>
            nds.map((node) => {
              if (node.id === id) {
                return {
                  ...node,
                  data: { ...node.data, splitInputs, splitOutputs },
                };
              }
              return node;
            }),
          );
        }}
      />
    </div>
  );
};
