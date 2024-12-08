import React, { useEffect, useState } from 'react';

import { useReactFlow } from '@xyflow/react';

import { PTBNodeProp } from '..';
import { useStateContext } from '../../../Provider';
import { PtbHandleVector } from '../handles';
import {
  ButtonStyles,
  FormStyle,
  FormTitleStyle,
  InputStyle,
  LabelStyle,
  NodeStyles,
} from '../styles';

export const SuiBoolVector = ({ id, data }: PTBNodeProp) => {
  const { setNodes } = useReactFlow();
  const { isEditor } = useStateContext();
  const [isShow, setIsShow] = useState<boolean>(
    data && data.value ? (data.value as string[]).length < 4 : true,
  );
  const [items, setItems] = useState<string[]>((data.value as string[]) || []);

  const addItem = () => {
    data.value = [...items, 'false'];
    setItems(() => [...(data.value as string[])]);
  };

  const removeItem = (index: number) => {
    data.value = items.filter((_, i) => i !== index);
    setItems(() => [...(data.value as string[])]);
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
              className="self-end"
              onChange={(e) => {
                setIsShow(e.target.checked);
              }}
            />
          </div>
        </div>
        {isShow && (
          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              fontSize: '13px',
            }}
          >
            <tbody>
              {items.map((item, index) => (
                <tr key={index}>
                  <td
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                    }}
                  >
                    <select
                      className={InputStyle}
                      disabled={!isEditor}
                      value={item}
                      onChange={(e) => updateItem(index, e.target.value)}
                    >
                      <option value="false">false</option>
                      <option value="true">true</option>
                    </select>
                    {isEditor && (
                      <button
                        className={`text-center text-xs rounded-md ${ButtonStyles.bool.text} ${ButtonStyles.bool.hoverBackground}`}
                        style={{
                          minWidth: '20px',
                        }}
                        onClick={() => removeItem(index)}
                      >
                        x
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {isEditor && (
                <tr>
                  <td
                    style={{
                      display: 'flex',
                      justifyContent: 'flex-end',
                    }}
                  >
                    <button
                      className={`w-full py-1 text-center text-xs rounded-md ${ButtonStyles.bool.text} ${ButtonStyles.bool.hoverBackground}`}
                      onClick={addItem}
                    >
                      Add
                    </button>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>
      <PtbHandleVector
        typeHandle="source"
        typeParams="vector<bool>"
        name="inputs"
      />
    </div>
  );
};
