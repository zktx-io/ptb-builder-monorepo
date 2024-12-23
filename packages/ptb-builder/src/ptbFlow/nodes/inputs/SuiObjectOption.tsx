import React, { useEffect, useState } from 'react';

import { useReactFlow } from '@xyflow/react';

import { PTBNodeProp } from '..';
import { useStateContext } from '../../../provider';
import { PtbHandle } from '../handles';
import { FormStyle, InputStyle, LabelStyle, NodeStyles } from '../styles';

export const SuiObjectOption = ({ id, data }: PTBNodeProp) => {
  const { setNodes } = useReactFlow();
  const { isEditor } = useStateContext();
  const [inputValue, setInputValue] = useState<string[]>(
    (data.value as string[]) || ['', ''],
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
          placeholder="type"
          autoComplete="off"
          className={InputStyle}
          readOnly={!isEditor}
          value={inputValue[0]}
          onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
            setInputValue((old) => [event.target.value, old[1]]);
          }}
        />
        <input
          type="text"
          placeholder="value"
          autoComplete="off"
          className={InputStyle}
          readOnly={!isEditor}
          value={inputValue[1]}
          onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
            setInputValue((old) => [old[0], event.target.value]);
          }}
        />
      </div>
      <PtbHandle typeHandle="source" typeParams="object" name="inputs" />
    </div>
  );
};
