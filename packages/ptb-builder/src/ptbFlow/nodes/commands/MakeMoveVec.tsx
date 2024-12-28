import React, { useState } from 'react';

import { useReactFlow } from '@xyflow/react';

import { PTBNodeProp } from '..';
import { CmdParamsVector } from '../../components';
import { PtbHandleProcess } from '../handles';
import { NodeStyles } from '../styles';
import { TYPE_PARAMS } from '../types';

export const MakeMoveVec = ({ id, data }: PTBNodeProp) => {
  const { setEdges, setNodes } = useReactFlow();
  const [type, setType] = useState<TYPE_PARAMS>(
    data.makeMoveVector || 'object',
  );

  const resetEdge = (handle: 'source' | 'target') => {
    setEdges((eds) =>
      eds.filter(
        (edge) =>
          !(
            ((edge.target === id && handle === 'target') ||
              (edge.source === id && handle === 'source')) &&
            edge.type === 'Data'
          ),
      ),
    );
  };

  return (
    <div className={NodeStyles.command}>
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
      <CmdParamsVector
        id={id}
        type={type}
        data={data}
        resetEdge={resetEdge}
        updateState={(type: TYPE_PARAMS, splitInputs?: number) => {
          setType(type);
          setNodes((nds) =>
            nds.map((node) => {
              if (node.id === id) {
                return {
                  ...node,
                  data: { ...node.data, splitInputs, makeMoveVector: type },
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
