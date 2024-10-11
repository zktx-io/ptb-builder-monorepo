import React, { useEffect, useState } from 'react';

import { useReactFlow } from '@xyflow/react';

import { type NodeProp } from '..';
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

export const SuiU16Vector = ({ id, data }: NodeProp) => {
  const { setNodes } = useReactFlow();
  const { isEditor } = useStateContext();
  const [isShow, setIsShow] = useState<boolean>(
    data && data.value ? (data.value as string[]).length < 4 : true,
  );
  const [items, setItems] = useState<string[]>((data.value as string[]) || []);

  const addItem = () => {
    data.value = [...items, 0];
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
            data: { ...node.data, value: items.map((item) => parseInt(item)) },
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
          <label className={LabelStyle}>{`vector<u16>`}</label>
          <div className="flex items-center">
            <label
              htmlFor="gas-checkbox"
              className="text-xs text-gray-900 dark:text-gray-100 mr-1"
            >
              Show
            </label>
            <input
              type="checkbox"
              id="gas-checkbox"
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
                    <input
                      type="number"
                      placeholder="Enter number"
                      autoComplete="off"
                      className={InputStyle}
                      readOnly={!isEditor}
                      value={item}
                      onChange={(e) => updateItem(index, e.target.value)}
                    />
                    {isEditor && (
                      <button
                        className={`text-center text-xs rounded-md ${ButtonStyles.number.text} ${ButtonStyles.number.hoverBackground}`}
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
                      className={`w-full py-1 text-center text-xs rounded-md ${ButtonStyles.number.text} ${ButtonStyles.number.hoverBackground}`}
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
        typeParams="vector<u16>"
        name="inputs"
      />
    </div>
  );
};
