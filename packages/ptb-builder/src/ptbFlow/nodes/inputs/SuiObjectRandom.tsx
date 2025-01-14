import React, { useEffect } from 'react';

import { useReactFlow } from '@xyflow/react';

import { PTBNodeProp } from '..';
import { IconDice } from '../../../icons';
import { PtbHandle } from '../handles';
import { FormStyle, LabelStyle, NodeStyles } from '../styles';

export const SuiObjectRandom = ({ id, data }: PTBNodeProp) => {
  const { setNodes } = useReactFlow();
  useEffect(() => {
    setNodes((nds) =>
      nds.map((node) => {
        if (node.id === id) {
          return {
            ...node,
            data: { ...node.data, value: 'tx.object.random()' },
          };
        }
        return node;
      }),
    );
  }, [id, setNodes]);
  return (
    <div className={NodeStyles.object}>
      <div className={FormStyle}>
        <label className={`flex items-center gap-2 ${LabelStyle}`}>
          <IconDice />
          {data.label}
        </label>
      </div>
      <PtbHandle typeHandle="source" typeParams="object" name="inputs" />
    </div>
  );
};
