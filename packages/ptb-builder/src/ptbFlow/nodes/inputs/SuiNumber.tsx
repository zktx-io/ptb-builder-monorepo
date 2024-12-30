import React, { useEffect, useState } from 'react';

import { useReactFlow } from '@xyflow/react';

import { PTBNodeProp } from '..';
import { useStateContext } from '../../../provider';
import { DEBOUNCE, useDebounce } from '../../../utilities';
import { PtbHandle } from '../handles';
import { FormStyle, InputStyle, LabelStyle, NodeStyles } from '../styles';
import { updateNodeData } from './updateNodeData';

export const SuiNumber = ({ id, data }: PTBNodeProp) => {
  const { setNodes } = useReactFlow();
  const { canEdit } = useStateContext();
  const [inputValue, setInputValue] = useState<number>(0);

  const { debouncedFunction: updateNodes } = useDebounce((value) => {
    setNodes((nds) =>
      updateNodeData({
        nodes: nds,
        nodeId: id,
        updater: (data) => ({ ...data, value }),
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

  useEffect(() => {
    setInputValue((data.value as number) || 0);
    setNodes((nds) =>
      updateNodeData({
        nodes: nds,
        nodeId: id,
        updater: (data) => ({ ...data, value: (data.value as number) || 0 }),
      }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
