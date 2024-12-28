import React, { useState } from 'react';

import { useReactFlow } from '@xyflow/react';

import { PTBNodeProp } from '..';
import { useStateContext } from '../../../provider';
import { DEBOUNCE, useDebounce } from '../../../utilities';
import { PtbHandle } from '../handles';
import { FormStyle, InputStyle, LabelStyle, NodeStyles } from '../styles';

export const SuiNumber = ({ id, data }: PTBNodeProp) => {
  const { setNodes } = useReactFlow();
  const { canEdit } = useStateContext();
  const [inputValue, setInputValue] = useState<number>(
    (data.value as number) || 0,
  );

  const { debouncedFunction: updateNodes } = useDebounce((value) => {
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

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value;
    const numericValue = Number(value);
    if (value === '' || (!Number.isNaN(numericValue) && numericValue >= 0)) {
      setInputValue(numericValue);
      updateNodes(numericValue);
    }
  };

  return (
    <div className={NodeStyles.number}>
      <div className={FormStyle}>
        <label className={LabelStyle}>{data.label}</label>
        <input
          type="number"
          placeholder="Enter number"
          autoComplete="off"
          className={InputStyle}
          readOnly={!canEdit}
          value={inputValue}
          min={0}
          onChange={handleChange}
        />
      </div>
      <PtbHandle typeHandle="source" typeParams="number" name="inputs" />
    </div>
  );
};
