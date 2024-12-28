import React from 'react';

import { useReactFlow } from '@xyflow/react';

import { PTBNodeProp } from '..';
import { CmdParams } from '../../components';
import { PtbHandleProcess } from '../handles';
import { NodeStyles } from '../styles';

export const TransferObjects = ({ id, data }: PTBNodeProp) => {
  const { setEdges, setNodes } = useReactFlow();

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

  return (
    <div className={NodeStyles.command}>
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
      <CmdParams
        id={id}
        input1={{ label: 'address', type: 'address' }}
        input2={{ label: 'objects', type: 'object[]' }}
        data={data}
        resetEdge={resetEdge}
        updateState={(splitInputs: number | undefined) => {
          setNodes((nds) =>
            nds.map((node) => {
              if (node.id === id) {
                return {
                  ...node,
                  data: { ...node.data, splitInputs },
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
