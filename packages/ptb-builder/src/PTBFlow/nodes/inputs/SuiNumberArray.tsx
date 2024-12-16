import React, { useEffect, useState } from 'react';

import { useReactFlow } from '@xyflow/react';

import { PTBNodeProp } from '..';
import { InputArgs } from '../../../_Components/InputArgs';
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
  const [isShow, setIsShow] = useState<boolean>(
    data && data.value ? (data.value as string[]).length < 4 : true,
  );
  const [items, setItems] = useState<number[]>((data.value as number[]) || []);

  const addItem = () => {
    data.value = [...items, 0];
    setItems(() => [...(data.value as number[])]);
  };

  const removeItem = (index: number) => {
    data.value = items.filter((_, i) => i !== index);
    setItems(() => [...(data.value as number[])]);
  };

  const updateItem = (index: number, value: number) => {
    const updatedItems = items.map((item, i) => (i === index ? value : item));
    data.value = updatedItems;
    setItems(updatedItems);
  };

  useEffect(() => {
    setNodes((nds) =>
      nds.map((node) => {
        if (node.id === id) {
          return {
            ...node,
            data: { ...node.data, value: items },
          };
        }
        return node;
      }),
    );
  }, [id, items, setNodes]);

  return (
    <div className={NodeStyles.number}>
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
        <InputArgs
          isNumber
          isShow={isShow}
          items={items}
          placeholder="Enter number"
          addItem={addItem}
          removeItem={removeItem}
          updateItem={updateItem}
          style={{
            deleteButton: `text-center text-xs rounded-md ${ButtonStyles.number.text} ${ButtonStyles.number.hoverBackground}`,
            addButton: `w-full py-1 text-center text-xs rounded-md ${ButtonStyles.number.text} ${ButtonStyles.number.hoverBackground}`,
          }}
        />
      </div>
      <PtbHandleArray typeHandle="source" typeParams="number[]" name="inputs" />
    </div>
  );
};
