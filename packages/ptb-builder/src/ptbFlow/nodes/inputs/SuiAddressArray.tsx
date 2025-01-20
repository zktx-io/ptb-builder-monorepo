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

export const SuiAddressArray = ({ id, data }: PTBNodeProp) => {
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
      <PtbHandleArray
        typeHandle="source"
        typeParams="address[]"
        name="inputs"
      />
    </div>
  );
};
