import React, { useState } from 'react';

import { useReactFlow } from '@xyflow/react';

import { PTBNodeProp } from '..';
import { useStateContext } from '../../../provider';
import { DEBOUNCE, useDebounce } from '../../../utilities';
import { PtbHandle } from '../handles';
import { FormStyle, InputStyle, LabelStyle, NodeStyles } from '../styles';

export const SuiBool = ({ id, data }: PTBNodeProp) => {
  const { setNodes } = useReactFlow();
  const { canEdit } = useStateContext();
  const [inputValue, setInputValue] = useState<string>(
    data.value === 'true' ? 'true' : 'false',
  );

  const { debouncedFunction: updateNodes } = useDebounce((value: string) => {
    setNodes((nds) =>
      nds.map((node) => {
        if (node.id === id) {
          return {
            ...node,
            data: { ...node.data, value },
          };
        }
        return node;
      }),
    );
  }, DEBOUNCE);

  const handleChange = (evt: React.ChangeEvent<HTMLSelectElement>) => {
    const value = evt.target.value;
    setInputValue(value);
    updateNodes(value);
  };

  return (
    <div className={NodeStyles.bool}>
      <div className={FormStyle}>
        <label className={LabelStyle}>{data.label}</label>
        <select
          className={InputStyle}
          disabled={!canEdit}
          value={inputValue}
          onChange={handleChange}
        >
          <option value="false">false</option>
          <option value="true">true</option>
        </select>
      </div>
      <PtbHandle typeHandle="source" typeParams="bool" name="inputs" />
    </div>
  );
};
