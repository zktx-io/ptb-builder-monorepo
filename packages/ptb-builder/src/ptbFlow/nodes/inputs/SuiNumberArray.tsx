import React from 'react';

import { useReactFlow } from '@xyflow/react';

import { PTBNodeProp } from '..';
import { DEBOUNCE, useDebounce } from '../../../utilities';
import { ArrayInputs } from '../../components';
import { PtbHandleArray } from '../handles';
import {
  ButtonStyles,
  FormStyle,
  FormTitleStyle,
  LabelStyle,
  NodeStyles,
} from '../styles';

export const SuiNumberArray = ({ id, data }: PTBNodeProp) => {
  const { setNodes } = useReactFlow();

  const { debouncedFunction: updateNodes } = useDebounce((updatedItems) => {
    setNodes((nds) =>
      nds.map((node) => {
        if (node.id === id) {
          return {
            ...node,
            data: { ...node.data, value: updatedItems },
          };
        }
        return node;
      }),
    );
  }, DEBOUNCE);

  return (
    <div className={NodeStyles.number}>
      <div className={FormStyle}>
        <div className={FormTitleStyle}>
          <label className={LabelStyle}>{data.label}</label>
        </div>
        <ArrayInputs
          id={id}
          placeholder="Enter number"
          style={{
            deleteButton: `text-center text-xs rounded-md ${ButtonStyles.number.text} ${ButtonStyles.number.hoverBackground}`,
            addButton: `w-full py-1 text-center text-xs rounded-md ${ButtonStyles.number.text} ${ButtonStyles.number.hoverBackground}`,
          }}
          isNumber
          data={(data.value as string[]) || ['0']}
          update={updateNodes}
        />
      </div>
      <PtbHandleArray typeHandle="source" typeParams="number[]" name="inputs" />
    </div>
  );
};
