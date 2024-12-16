import React, { useEffect, useState } from 'react';

import { useReactFlow } from '@xyflow/react';

import { PTBNodeProp } from '..';
import { useStateContext } from '../../../_provider';
import { PtbHandle } from '../handles';
import { FormStyle, InputStyle, LabelStyle, NodeStyles } from '../styles';

export const SuiBool = ({ id, data }: PTBNodeProp) => {
  const { setNodes } = useReactFlow();
  const { isEditor } = useStateContext();
  const [inputValue, setInputValue] = useState<string>(
    data.value === 'true' ? 'true' : 'false',
  );

  useEffect(() => {
    setNodes((nds) =>
      nds.map((node) => {
        if (node.id === id) {
          return {
            ...node,
            data: { ...node.data, value: inputValue },
          };
        }
        return node;
      }),
    );
  }, [inputValue, setNodes, id]);

  return (
    <div className={NodeStyles.bool}>
      <div className={FormStyle}>
        <label className={LabelStyle}>{data.label}</label>
        <select
          className={InputStyle}
          disabled={!isEditor}
          value={inputValue}
          onChange={(evt) => {
            setInputValue(evt.target.value);
          }}
        >
          <option value="false">false</option>
          <option value="true">true</option>
        </select>
      </div>
      <PtbHandle typeHandle="source" typeParams="bool" name="inputs" />
    </div>
  );
};
