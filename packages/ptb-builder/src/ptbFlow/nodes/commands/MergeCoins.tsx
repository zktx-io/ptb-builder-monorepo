import React from 'react';

import { useReactFlow } from '@xyflow/react';

import { PTBNodeProp } from '..';
import { CmdParams } from '../../components';
import { PtbHandleProcess } from '../handles';
import { NodeStyles } from '../styles';

export const MergeCoins = ({ id, data }: PTBNodeProp) => {
  const { setEdges } = useReactFlow();

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

  return (
    <div className={NodeStyles.command}>
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
      <CmdParams
        id={id}
        input1={{ label: 'destination', type: 'object' }}
        input2={{ label: 'source', type: 'object[]' }}
        data={data}
        resetEdge={resetEdge}
        updateState={(paramLength: (number | undefined)[]) => {
          data.getIoLength = () => paramLength;
        }}
      />
    </div>
  );
};
