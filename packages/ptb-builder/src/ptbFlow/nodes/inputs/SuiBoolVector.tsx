import React from 'react';

import { useReactFlow } from '@xyflow/react';

import { PTBNodeProp } from '..';
import { DEBOUNCE, useDebounce } from '../../../utilities';
import { ArrayInputs } from '../../components';
import { PtbHandleVector } from '../handles';
import {
  ButtonStyles,
  FormStyle,
  FormTitleStyle,
  LabelStyle,
  NodeStyles,
} from '../styles';
import { updateNodeData } from './updateNodeData';

export const SuiBoolVector = ({ id, data }: PTBNodeProp) => {
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
    <div className={NodeStyles.bool}>
      <div className={FormStyle}>
        <div className={FormTitleStyle}>
          <label className={LabelStyle}>{data.label}</label>
        </div>
        <ArrayInputs
          id={id}
          placeholder="Enter boolean"
          style={{
            deleteButton: `text-center text-xs rounded-md ${ButtonStyles.bool.text} ${ButtonStyles.bool.hoverBackground}`,
            addButton: `w-full py-1 text-center text-xs rounded-md ${ButtonStyles.bool.text} ${ButtonStyles.bool.hoverBackground}`,
          }}
          isBoolean
          data={(data.value as string[]) || ['true']}
          update={updateNodes}
        />
      </div>
      <PtbHandleVector
        typeHandle="source"
        typeParams="vector<bool>"
        name="inputs"
      />
    </div>
  );
};
