import React, { useEffect, useState } from 'react';

import { useReactFlow } from '@xyflow/react';

import { type NodeProp } from '..';
import { useStateContext } from '../../../Provider';
import { PtbHandle } from '../handles';
import { FormStyle, InputStyle, LabelStyle, NodeStyles } from '../styles';

export const SuiString = ({ id, data }: NodeProp) => {
  const { setNodes } = useReactFlow();
  const { isEditor } = useStateContext();
  const [inputValue, setInputValue] = useState<string>(
    (data.value as string) || '',
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
    <div className={NodeStyles.string}>
      <div className={FormStyle}>
        <label className={LabelStyle}>String</label>
        <input
          type="text"
          placeholder="Enter string"
          autoComplete="off"
          className={InputStyle}
          readOnly={!isEditor}
          value={inputValue}
          onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
            setInputValue(event.target.value);
          }}
        />
      </div>
      <PtbHandle typeHandle="source" typeParams="string" name="inputs" />
    </div>
  );
};
