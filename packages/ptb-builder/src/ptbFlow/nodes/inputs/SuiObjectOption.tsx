import React, { useState } from 'react';

import { useReactFlow } from '@xyflow/react';

import { PTBNodeProp } from '..';
import { useStateContext } from '../../../provider';
import { DEBOUNCE, useDebounce } from '../../../utilities';
import { PtbHandle } from '../handles';
import { FormStyle, InputStyle, LabelStyle, NodeStyles } from '../styles';

export const SuiObjectOption = ({ id, data }: PTBNodeProp) => {
  const { setNodes } = useReactFlow();
  const { canEdit } = useStateContext();
  const [inputValue, setInputValue] = useState<string[]>(
    (data.value as string[]) || ['', ''],
  );

  const { debouncedFunction: updateNodes } = useDebounce(
    (updatedValue: string[]) => {
      setNodes((nds) =>
        nds.map((node) => {
          if (node.id === id) {
            return {
              ...node,
              data: { ...node.data, value: updatedValue },
            };
          }
          return node;
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

  return (
    <div className={NodeStyles.object}>
      <div className={FormStyle}>
        <label className={LabelStyle}>{data.label}</label>
        <input
          type="text"
          placeholder="type"
          autoComplete="off"
          className={InputStyle}
          readOnly={!canEdit}
          value={inputValue[0]}
          onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
            handleInputChange(0, event.target.value)
          }
        />
        <input
          type="text"
          placeholder="value"
          autoComplete="off"
          className={InputStyle}
          readOnly={!canEdit}
          value={inputValue[1]}
          onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
            handleInputChange(1, event.target.value)
          }
        />
      </div>
      <PtbHandle typeHandle="source" typeParams="object" name="inputs" />
    </div>
  );
};
