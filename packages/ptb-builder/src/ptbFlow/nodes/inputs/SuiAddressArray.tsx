import React, { useEffect, useState } from 'react';

import { useReactFlow } from '@xyflow/react';

import { PTBNodeProp } from '..';
import { ArrayInputs } from '../../components';
import { PtbHandleArray } from '../handles';
import {
  ButtonStyles,
  FormStyle,
  FormTitleStyle,
  LabelStyle,
  NodeStyles,
} from '../styles';

export const SuiAddressArray = ({ id, data }: PTBNodeProp) => {
  const { setNodes } = useReactFlow();
  const [isShow, setIsShow] = useState<boolean>(
    data && data.value ? (data.value as string[]).length < 4 : true,
  );
  const [items, setItems] = useState<string[]>(
    (data.value as string[]) || [''],
  );

  const addItem = () => {
    data.value = [...items, ''];
    setItems(() => [...(data.value as string[])]);
  };

  const removeItem = (index: number) => {
    if (items.length > 1) {
      data.value = items.filter((_, i) => i !== index);
      setItems(() => [...(data.value as string[])]);
    }
  };

  const updateItem = (index: number, value: string) => {
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
          isShow={isShow}
          items={items}
          placeholder="Enter address"
          addItem={addItem}
          removeItem={removeItem}
          updateItem={updateItem}
          style={{
            deleteButton: `text-center text-xs rounded-md ${ButtonStyles.address.text} ${ButtonStyles.address.hoverBackground}`,
            addButton: `w-full py-1 text-center text-xs rounded-md ${ButtonStyles.address.text} ${ButtonStyles.address.hoverBackground}`,
          }}
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
