import React, { useState } from 'react';

import { useReactFlow } from '@xyflow/react';

import { PTBNodeProp } from '..';
import { CmdParamsVector } from '../../components';
import { PtbHandleProcess } from '../handles';
import { NodeStyles } from '../styles';
import { TYPE_PARAMS } from '../types';

export const MakeMoveVec = ({ id, data }: PTBNodeProp) => {
  const { setEdges } = useReactFlow();
  const [type, setType] = useState<TYPE_PARAMS>(
    data.makeMoveVector || 'string',
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
        resetEdge={resetEdge}
        updateState={(
          type: TYPE_PARAMS,
          paramLength: (number | undefined)[],
        ) => {
          setType(type);
          data.makeMoveVector = type;
          data.getIoLength = () => paramLength;
        }}
      />
    </div>
  );
};
