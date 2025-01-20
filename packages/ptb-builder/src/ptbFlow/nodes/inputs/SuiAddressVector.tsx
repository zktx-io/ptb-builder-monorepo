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

export const SuiAddressVector = ({ id, data }: PTBNodeProp) => {
  const { setNodes } = useReactFlow();

  const { debouncedFunction: updateNodes } = useDebounce((updatedItems) => {
    setNodes((nds) =>
      updateNodeData({
        nodes: nds,
        nodeId: id,
        updater: (data) => ({ ...data, value: updatedItems }),
      }),
    );
  }, DEBOUNCE);

  return (
    <div className={NodeStyles.address}>
      <div className={FormStyle}>
        <div className={FormTitleStyle}>
          <label className={LabelStyle}>{data.label}</label>
          <div className="flex items-center">
            <label
              htmlFor="checkbox"
              className="text-xs text-gray-900 dark:text-gray-100 mr-1"
            >
              Show
            </label>
          </div>
        </div>
        <ArrayInputs
          id={id}
          placeholder="Enter address"
          style={{
            deleteButton: `text-center text-xs rounded-md ${ButtonStyles.address.text} ${ButtonStyles.address.hoverBackground}`,
            addButton: `w-full py-1 text-center text-xs rounded-md ${ButtonStyles.address.text} ${ButtonStyles.address.hoverBackground}`,
          }}
          data={(data.value as string[]) || ['']}
          update={updateNodes}
        />
      </div>
      <PtbHandleVector
        typeHandle="source"
        typeParams="vector<address>"
        name="inputs"
      />
    </div>
  );
};
