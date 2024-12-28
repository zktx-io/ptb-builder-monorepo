import React, { useEffect } from 'react';

import { useUpdateNodeInternals } from '@xyflow/react';

import { useStateContext } from '../../provider';
import { InputStyle } from '../nodes/styles';

export const ArrayInputs = ({
  id,
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
  id: string;
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
  const updateNodeInternals = useUpdateNodeInternals();

  const handleAddItem = () => {
    addItem();
    updateNodeInternals(id);
  };

  const handleRemoveItem = (index: number) => {
    removeItem(index);
    updateNodeInternals(id);
  };

  const handleUpdateItem = (index: number, value: any) => {
    updateItem(index, value);
    updateNodeInternals(id);
  };

  useEffect(() => {
    updateNodeInternals(id);
  }, [id, updateNodeInternals]);

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
                      onChange={(e) => handleUpdateItem(index, e.target.value)}
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
                    handleUpdateItem(
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
                        onClick={() => handleRemoveItem(index)}
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
                  <button className={style.addButton} onClick={handleAddItem}>
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
