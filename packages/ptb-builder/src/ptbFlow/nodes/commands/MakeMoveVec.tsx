import React, { useEffect } from 'react';

import { useReactFlow, useUpdateNodeInternals } from '@xyflow/react';

import { PTBNodeProp } from '..';
import { CmdParamsVector } from '../../components';
import { PtbHandleProcess } from '../handles';
import { NodeStyles } from '../styles';
import { TYPE_PARAMS } from '../types';

export const MakeMoveVec = ({ id, data }: PTBNodeProp) => {
  const { setEdges, setNodes } = useReactFlow();
  const updateNodeInternals = useUpdateNodeInternals();

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
    updateNodeInternals(id);
  };

  useEffect(() => {
    updateNodeInternals(id);
  }, [id, updateNodeInternals]);

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
        data={data}
        resetEdge={resetEdge}
        updateState={(
          type: TYPE_PARAMS,
          omit: boolean,
          splitInputs?: number,
        ) => {
          setNodes((nds) =>
            nds.map((node) => {
              if (node.id === id) {
                return {
                  ...node,
                  data: {
                    ...node.data,
                    splitInputs,
                    makeMoveVector: { type, omit },
                  },
                };
              }
              return node;
            }),
          );
          updateNodeInternals(id);
        }}
      />
    </div>
  );
};
