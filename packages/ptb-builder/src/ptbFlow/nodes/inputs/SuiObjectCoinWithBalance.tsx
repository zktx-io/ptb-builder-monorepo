import React, { useEffect, useState } from 'react';

import { useReactFlow } from '@xyflow/react';

import { PTBNodeProp } from '..';
import { updateNodeData } from './updateNodeData';
import { useStateContext } from '../../../provider';
import { DEBOUNCE, useDebounce } from '../../../utilities';
import { PtbHandle } from '../handles';
import { FormStyle, InputStyle, LabelStyle, NodeStyles } from '../styles';

export const SuiObjectCoinWithBalance = ({ id, data }: PTBNodeProp) => {
  const { setNodes } = useReactFlow();
  const { canEdit } = useStateContext();
  const [inputValue, setInputValue] = useState<string[]>(
    (data.value as string[]) || ['true', '', '0'],
  );

  const { debouncedFunction: updateNodes } = useDebounce(
    (updatedValue: string[]) => {
      setNodes((nds) =>
        updateNodeData({
          nodes: nds,
          nodeId: id,
          updater: (data) => ({ ...data, value: updatedValue }),
        }),
      );
    },
    DEBOUNCE,
  );

  const handleInputChange = (index: number, value: string) => {
    const updatedValue = [...inputValue];
    updatedValue[index] = value;
    setInputValue(updatedValue);
    updateNodes(updatedValue);
  };

  useEffect(() => {
    setInputValue((data.value as string[]) || ['true', '', '0']);
    setNodes((nds) =>
      updateNodeData({
        nodes: nds,
        nodeId: id,
        updater: (data) => ({
          ...data,
          value: (data.value as string[]) || ['true', '', '0'],
        }),
      }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className={NodeStyles.object}>
      <div className={FormStyle}>
        <label className={LabelStyle}>{data.label}</label>
        <select
          className={InputStyle}
          disabled={!canEdit}
          value={inputValue[0]}
          onChange={(evt: React.ChangeEvent<HTMLSelectElement>) => {
            const value = evt.target.value;
            handleInputChange(0, value);
          }}
        >
          <option value="false">useGasCoin: false</option>
          <option value="true">useGasCoin: true</option>
        </select>
        <input
          type="text"
          placeholder="type"
          autoComplete="off"
          className={InputStyle}
          readOnly={!canEdit}
          value={inputValue[1]}
          onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
            handleInputChange(1, event.target.value)
          }
        />
        <input
          type="number"
          placeholder="balance"
          autoComplete="off"
          className={InputStyle}
          readOnly={!canEdit}
          value={inputValue[2]}
          onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
            handleInputChange(2, event.target.value)
          }
        />
      </div>
      <PtbHandle typeHandle="source" typeParams="object" name="inputs" />
    </div>
  );
};
