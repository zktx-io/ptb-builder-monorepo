import React, { useEffect, useState } from 'react';

import { useReactFlow } from '@xyflow/react';

import { type NodeProp } from '..';
import { useStateContext } from '../../../Provider';
import { PtbHandle } from '../handles/PtbHandle';
import { FormStyle, InputStyle, LabelStyle, NodeStyles } from '../styles';

export const SuiAddress = ({ id, data }: NodeProp) => {
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
    <div className={NodeStyles.address}>
      <div className={FormStyle}>
        <label className={LabelStyle}>address</label>
        <input
          type="text"
          placeholder="Enter address"
          autoComplete="off"
          className={InputStyle}
          readOnly={!isEditor}
          value={inputValue}
          onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
            setInputValue(event.target.value);
          }}
        />
      </div>
      <PtbHandle typeHandle="source" typeParams="address" name="inputs" />
    </div>
  );
};
