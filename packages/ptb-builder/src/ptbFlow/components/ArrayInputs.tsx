import React, { useEffect, useRef, useState } from 'react';

import { useUpdateNodeInternals } from '@xyflow/react';

import { useStateContext } from '../../provider';
import { IndexStyle, InputStyle } from '../nodes/styles';

export const ArrayInputs = ({
  id,
  isBoolean,
  isNumber,
  placeholder,
  data,
  update,
  style,
}: {
  id: string;
  isBoolean?: boolean;
  isNumber?: boolean;
  placeholder: string;
  data: string[];
  update: (items: string[]) => void;
  style: {
    deleteButton: string;
    addButton: string;
  };
}) => {
  const { canEdit } = useStateContext();
  // eslint-disable-next-line no-restricted-syntax
  const debounceTimeout = useRef<NodeJS.Timeout | null>(null);

  const updateNodeInternals = useUpdateNodeInternals();
  const [items, setItems] = useState<string[]>(data || isNumber ? ['0'] : ['']);

  const handleAddItem = () => {
    const updateItems = [...items, isNumber ? '0' : ''];
    setItems(updateItems);
    update(updateItems);
  };

  const handleRemoveItem = (index: number) => {
    if (items.length > 1) {
      const updateItems = items.filter((_, i) => i !== index);
      setItems(updateItems);
      update(updateItems);
    }
  };

  const handleUpdateItem = (index: number, value: string) => {
    const updatedItems = items.map((item, i) => (i === index ? value : item));
    setItems(updatedItems);
    update(updatedItems);
  };

  useEffect(() => {
    updateNodeInternals(id);
  }, [id, updateNodeInternals]);

  useEffect(() => {
    update(data || isNumber ? ['0'] : ['']);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
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
              ) => handleUpdateItem(index, e.target.value),
            };

            return isNumber ? (
              <input type="number" min={0} {...commonInputProps} />
            ) : (
              <input type="text" {...commonInputProps} />
            );
          };

          return (
            <tr key={index}>
              <td className={IndexStyle}>{`[${index}]`}</td>
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
            <td colSpan={2} style={{ textAlign: 'center' }}>
              <button className={style.addButton} onClick={handleAddItem}>
                Add
              </button>
            </td>
          </tr>
        )}
      </tbody>
    </table>
  );
};
