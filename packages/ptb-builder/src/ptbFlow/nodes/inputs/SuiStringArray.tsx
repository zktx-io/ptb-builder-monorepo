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
import { updateNodeData } from './updateNodeData';

export const SuiStringArray = ({ id, data }: PTBNodeProp) => {
  const { setNodes } = useReactFlow();

  const { debouncedFunction: updateNodes } = useDebounce(
    (updatedItems: string[]) => {
      setNodes((nds) =>
        updateNodeData({
          nodes: nds,
          nodeId: id,
          updater: (data) => ({ ...data, value: updatedItems }),
        }),
      );
    },
    DEBOUNCE,
  );

  return (
    <div className={NodeStyles.string}>
      <div className={FormStyle}>
        <div className={FormTitleStyle}>
          <label className={LabelStyle}>{data.label}</label>
        </div>
        <ArrayInputs
          id={id}
          placeholder="Enter string"
          style={{
            deleteButton: `text-center text-xs rounded-md ${ButtonStyles.string.text} ${ButtonStyles.string.hoverBackground}`,
            addButton: `w-full py-1 text-center text-xs rounded-md ${ButtonStyles.string.text} ${ButtonStyles.string.hoverBackground}`,
          }}
          data={(data.value as string[]) || ['']}
          update={updateNodes}
        />
      </div>
      <PtbHandleArray typeHandle="source" typeParams="string[]" name="inputs" />
    </div>
  );
};
