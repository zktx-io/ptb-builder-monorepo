import React, { useEffect, useState } from 'react';

import { useReactFlow } from '@xyflow/react';

import { PTBNodeProp } from '..';
import { useStateContext } from '../../../provider';
import { PtbHandle } from '../handles';
import { FormStyle, InputStyle, LabelStyle, NodeStyles } from '../styles';

export const SuiObject = ({ id, data }: PTBNodeProp) => {
  const { setNodes } = useReactFlow();
  const { canEdit } = useStateContext();
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
    <div className={NodeStyles.object}>
      <div className={FormStyle}>
        <label className={LabelStyle}>{data.label}</label>
        <input
          type="text"
          placeholder="Enter object id"
          autoComplete="off"
          className={InputStyle}
          readOnly={!canEdit}
          value={inputValue}
          onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
            setInputValue(event.target.value);
          }}
        />
      </div>
      <PtbHandle typeHandle="source" typeParams="object" name="inputs" />
    </div>
  );
};
