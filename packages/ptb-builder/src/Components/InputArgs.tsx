import React from 'react';

import { useStateContext } from '../_provider';
import { InputStyle } from '../PTBFlow/nodes/styles';

export const InputArgs = ({
  isShow,
  isBoolean,
  isNumber,
  placeholder,
  items,
  addItem,
  removeItem,
  updateItem,
  style,
}: {
  isShow: boolean;
  isBoolean?: boolean;
  isNumber?: boolean;
  placeholder: string;
  items: string[] | number[];
  addItem: () => void;
  removeItem: (index: number) => void;
  updateItem: (index: number, value: any) => void;
  style: {
    deleteButton: string;
    addButton: string;
  };
}) => {
  const { isEditor } = useStateContext();

  return (
    <>
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
                  {isBoolean ? (
                    <select
                      className={InputStyle}
                      disabled={!isEditor}
                      value={item}
                      onChange={(e) => updateItem(index, e.target.value)}
                    >
                      <option value="false">false</option>
                      <option value="true">true</option>
                    </select>
                  ) : (
                    <input
                      type={isNumber ? 'number' : 'text'}
                      placeholder={placeholder}
                      autoComplete="off"
                      className={InputStyle}
                      readOnly={!isEditor}
                      value={item}
                      onChange={(e) =>
                        updateItem(
                          index,
                          isNumber ? parseInt(e.target.value) : e.target.value,
                        )
                      }
                    />
                  )}
                  {isEditor && (
                    <button
                      className={style.deleteButton}
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
                  <button className={style.addButton} onClick={addItem}>
                    Add
                  </button>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}
    </>
  );
};
