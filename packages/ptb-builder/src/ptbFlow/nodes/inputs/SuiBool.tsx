import React, { useEffect, useState } from 'react';

import { useReactFlow } from '@xyflow/react';

import { PTBNodeProp } from '..';
import { useStateContext } from '../../../provider';
import { DEBOUNCE, useDebounce } from '../../../utilities';
import { PtbHandle } from '../handles';
import { FormStyle, InputStyle, LabelStyle, NodeStyles } from '../styles';
import { updateNodeData } from './updateNodeData';

export const SuiBool = ({ id, data }: PTBNodeProp) => {
  const { setNodes } = useReactFlow();
  const { canEdit } = useStateContext();
  const [inputValue, setInputValue] = useState<string>(
    data.value === 'true' ? 'true' : 'false',
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

  const handleChange = (evt: React.ChangeEvent<HTMLSelectElement>) => {
    const value = evt.target.value;
    setInputValue(value);
    updateNodes(value);
  };

  useEffect(() => {
    setInputValue(data.value === 'true' ? 'true' : 'false');
    setNodes((nds) =>
      updateNodeData({
        nodes: nds,
        nodeId: id,
        updater: (data) => ({
          ...data,
          value: data.value === 'true' ? 'true' : 'false',
        }),
      }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
