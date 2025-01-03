import React, { useEffect } from 'react';

import { useReactFlow } from '@xyflow/react';

import { PTBNodeProp } from '..';
import { PtbHandle } from '../handles';
import { FormStyle, LabelStyle, NodeStyles } from '../styles';
import { updateNodeData } from './updateNodeData';

export const SuiString0x2suiSUI = ({ id, data }: PTBNodeProp) => {
  const { setNodes } = useReactFlow();
  useEffect(() => {
    setNodes((nds) =>
      updateNodeData({
        nodes: nds,
        nodeId: id,
        updater: (data) => ({ ...data, value: '0x2::sui::SUI' }),
      }),
    );
  }, [id, setNodes]);
  return (
    <div className={NodeStyles.string}>
      <div className={FormStyle}>
        <label className={LabelStyle}>{data.label}</label>
      </div>
      <PtbHandle typeHandle="source" typeParams="string" name="inputs" />
    </div>
  );
};
