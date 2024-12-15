import React, { useEffect } from 'react';

import { useReactFlow } from '@xyflow/react';

import { PTBNodeProp } from '..';
import { PtbHandle } from '../handles/PtbHandle';
import { FormStyle, LabelStyle, NodeStyles } from '../styles';

export const SuiAddressWallet = ({ id, data }: PTBNodeProp) => {
  const { setNodes } = useReactFlow();
  useEffect(() => {
    setNodes((nds) =>
      nds.map((node) => {
        if (node.id === id) {
          return {
            ...node,
            data: { ...node.data, value: 'myAddress' },
          };
        }
        return node;
      }),
    );
  }, [id, setNodes]);
  return (
    <div className={NodeStyles.address}>
      <div className={FormStyle}>
        <label className={LabelStyle}>{data.label}</label>
      </div>
      <PtbHandle typeHandle="source" typeParams="address" name="inputs" />
    </div>
  );
};
