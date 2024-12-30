import React, { useEffect, useState } from 'react';

import { useReactFlow } from '@xyflow/react';

import { PTBNodeProp } from '..';
import { useStateContext } from '../../../provider';
import { DEBOUNCE, useDebounce } from '../../../utilities';
import { PtbHandle } from '../handles';
import { FormStyle, InputStyle, LabelStyle, NodeStyles } from '../styles';
import { updateNodeData } from './updateNodeData';

export const SuiAddress = ({ id, data }: PTBNodeProp) => {
  const { setNodes } = useReactFlow();
  const { canEdit } = useStateContext();
  const [inputValue, setInputValue] = useState<string>(
    (data.value as string) || '',
  );

  const { debouncedFunction: updateNodes } = useDebounce((value: string) => {
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
    setInputValue(value);
    updateNodes(value);
  };

  useEffect(() => {
    setInputValue((data.value as string) || '');
    setNodes((nds) =>
      updateNodeData({
        nodes: nds,
        nodeId: id,
        updater: (data) => ({ ...data, value: (data.value as string) || '' }),
      }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className={NodeStyles.address}>
      <div className={FormStyle}>
        <label className={LabelStyle}>{data.label}</label>
        <input
          type="text"
          placeholder="Enter address"
          autoComplete="off"
          className={InputStyle}
          readOnly={!canEdit}
          value={inputValue}
          onChange={handleChange}
        />
      </div>
      <PtbHandle typeHandle="source" typeParams="address" name="inputs" />
    </div>
  );
};
