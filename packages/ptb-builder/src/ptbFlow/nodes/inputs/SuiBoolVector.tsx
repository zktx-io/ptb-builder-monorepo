import React, { useEffect, useState } from 'react';

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
  const [isShow, setIsShow] = useState<boolean>(
    data && data.value ? (data.value as string[]).length < 4 : true,
  );
  const [items, setItems] = useState<string[]>(
    (data.value as string[]) || ['true'],
  );

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

  const addItem = () => {
    const updatedItems = [...items, 'false'];
    setItems(updatedItems);
    updateNodes(updatedItems);
  };

  const removeItem = (index: number) => {
    if (items.length > 1) {
      const updatedItems = items.filter((_, i) => i !== index);
      setItems(updatedItems);
      updateNodes(updatedItems);
    }
  };

  const updateItem = (index: number, value: string) => {
    const updatedItems = items.map((item, i) => (i === index ? value : item));
    setItems(updatedItems);
    updateNodes(updatedItems);
  };

  useEffect(() => {
    setItems((data.value as string[]) || ['true']);
    setNodes((nds) =>
      updateNodeData({
        nodes: nds,
        nodeId: id,
        updater: (data) => ({
          ...data,
          value: (data.value as string[]) || ['true'],
        }),
      }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className={NodeStyles.bool}>
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
            <input
              type="checkbox"
              id="checkbox"
              checked={isShow}
              onChange={(e) => {
                setIsShow(e.target.checked);
              }}
            />
          </div>
        </div>
        <ArrayInputs
          id={id}
          isBoolean
          isShow={isShow}
          items={items}
          placeholder="Enter boolean"
          addItem={addItem}
          removeItem={removeItem}
          updateItem={updateItem}
          style={{
            deleteButton: `text-center text-xs rounded-md ${ButtonStyles.bool.text} ${ButtonStyles.bool.hoverBackground}`,
            addButton: `w-full py-1 text-center text-xs rounded-md ${ButtonStyles.bool.text} ${ButtonStyles.bool.hoverBackground}`,
          }}
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
