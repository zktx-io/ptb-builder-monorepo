import React, { useEffect, useState } from 'react';

import { useReactFlow } from '@xyflow/react';

import { type NodeProp } from '..';
import { useStateContext } from '../../../Provider';
import { PtbHandle } from '../handles';
import { FormStyle, InputStyle, LabelStyle, NodeStyles } from '../styles';

export const SuiBool = ({ id, data }: NodeProp) => {
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
        <label className={LabelStyle}>Boolean</label>
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
