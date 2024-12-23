import React, { useEffect } from 'react';

import { useReactFlow } from '@xyflow/react';

import { PTBNodeProp } from '..';
import { PtbHandle } from '../handles';
import { FormStyle, LabelStyle, NodeStyles } from '../styles';

export const SuiObjectSystem = ({ id, data }: PTBNodeProp) => {
  const { setNodes } = useReactFlow();
  useEffect(() => {
    setNodes((nds) =>
      nds.map((node) => {
        if (node.id === id) {
          return {
            ...node,
            data: { ...node.data, value: 'tx.object.system()' },
          };
        }
        return node;
      }),
    );
  }, [id, setNodes]);
  return (
    <div className={NodeStyles.object}>
      <div className={FormStyle}>
        <label className={LabelStyle}>{data.label}</label>
      </div>
      <PtbHandle typeHandle="source" typeParams="object" name="inputs" />
    </div>
  );
};
