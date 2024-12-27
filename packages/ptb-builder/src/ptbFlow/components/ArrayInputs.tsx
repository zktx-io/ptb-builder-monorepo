import React from 'react';

import { useStateContext } from '../../provider';
import { InputStyle } from '../nodes/styles';

export const ArrayInputs = ({
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
  const { canEdit } = useStateContext();

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
            {items.map((item, index) => {
              const renderInput = () => {
                if (isBoolean) {
                  return (
                    <select
                      className={InputStyle}
                      disabled={!canEdit}
                      value={item}
                      onChange={(e) => updateItem(index, e.target.value)}
                    >
                      <option value="false">false</option>
                      <option value="true">true</option>
                    </select>
                  );
                }

                const commonInputProps = {
                  className: InputStyle,
                  placeholder,
                  autoComplete: 'off',
                  readOnly: !canEdit,
                  value: item,
                  onChange: (
                    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>,
                  ) =>
                    updateItem(
                      index,
                      isNumber ? Number(e.target.value) : e.target.value,
                    ),
                };

                if (isNumber) {
                  return <input type="number" min={0} {...commonInputProps} />;
                }

                return <input type="text" {...commonInputProps} />;
              };

              return (
                <tr key={index}>
                  <td
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                    }}
                  >
                    {renderInput()}
                    {canEdit && (
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
              );
            })}
            {canEdit && (
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
