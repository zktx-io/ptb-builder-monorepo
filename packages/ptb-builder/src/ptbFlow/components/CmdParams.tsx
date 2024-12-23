import React, { useEffect, useState } from 'react';

import { useUpdateNodeInternals } from '@xyflow/react';

import { useStateContext } from '../../provider';
import { PtbHandle, PtbHandleArray } from '../nodes/handles';
import {
  ButtonStyles,
  FormTitleStyle,
  InputStyle,
  LabelStyle,
} from '../nodes/styles';
import { TYPE_ARRAY, TYPE_PARAMS } from '../nodes/types';

interface CmdParamsProps {
  id: string;
  input1: {
    label: string;
    type: TYPE_PARAMS | 'number';
  };
  input2: {
    label: string;
    type: TYPE_ARRAY;
  };
  resetEdge: (handle: 'source' | 'target') => void;
  updateState: (paramLength: (number | undefined)[]) => void;
}

export const CmdParams = ({
  id,
  input1,
  input2,
  resetEdge,
  updateState,
}: CmdParamsProps) => {
  const { isEditor } = useStateContext();
  const updateNodeInternals = useUpdateNodeInternals();

  const [isNestedInputs, setIsNestedInputs] = useState<boolean>(false);
  const [inputs, setInputs] = useState<string[]>([]);

  const addInputItem = () => {
    setInputs((oldData) => [...oldData, '']);
  };

  const removeInputItem = (index: number) => {
    if (inputs.length > 1) {
      resetEdge('target');
      setInputs((oldItems) => [...oldItems.filter((_, i) => i !== index)]);
    }
  };

  useEffect(() => {
    updateState([isNestedInputs ? inputs.length : undefined, undefined]);
  }, [inputs, isNestedInputs, updateState]);

  useEffect(() => {
    updateNodeInternals(id);
  }, [id, updateNodeInternals]);

  return (
    <>
      <div className={FormTitleStyle}>
        <label className={LabelStyle}>inputs</label>
        {isEditor && (
          <div className="flex items-center">
            <label
              htmlFor="checkbox"
              className="text-xs text-gray-900 dark:text-gray-100 mr-1"
            >
              split
            </label>
            <input
              type="checkbox"
              id="checkbox"
              checked={isNestedInputs}
              onChange={(e) => {
                resetEdge('target');
                setIsNestedInputs(e.target.checked);
                if (e.target.checked) {
                  addInputItem();
                } else {
                  setInputs([]);
                }
              }}
            />
          </div>
        )}
      </div>
      <table
        style={{
          width: '100%',
          borderCollapse: 'collapse',
          fontSize: '13px',
        }}
      >
        <tbody>
          <tr>
            <td
              style={{
                display: 'flex',
                alignItems: 'center',
              }}
            >
              <input
                type="text"
                placeholder={input1.label}
                autoComplete="off"
                className={InputStyle}
                readOnly
              />
              <PtbHandle
                typeHandle="target"
                typeParams={input1.type}
                name={input1.label}
                style={{ top: '62px' }}
              />
            </td>
          </tr>
          {!isNestedInputs ? (
            <tr>
              <td
                style={{
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                <input
                  type="text"
                  placeholder={input2.label}
                  autoComplete="off"
                  className={InputStyle}
                  readOnly
                />
                <PtbHandleArray
                  typeHandle="target"
                  typeParams={input2.type}
                  name={input2.label}
                  style={{ top: '90px' }}
                />
              </td>
            </tr>
          ) : (
            <>
              {inputs.map((_, index) => (
                <tr key={index}>
                  <td
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                    }}
                  >
                    <input
                      type="text"
                      placeholder={input2.label}
                      autoComplete="off"
                      className={InputStyle}
                      readOnly
                    />
                    <PtbHandle
                      typeHandle="target"
                      typeParams={input2.type.replace('[]', '') as any}
                      name={`${input2.label}[${index}]`}
                      style={{ top: `${90 + 28 * index}px` }}
                    />
                    {isEditor && (
                      <button
                        className={`text-center text-xs rounded-md ${ButtonStyles.transaction.text} ${ButtonStyles.transaction.hoverBackground}`}
                        style={{
                          minWidth: '20px',
                        }}
                        onClick={() => removeInputItem(index)}
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
                      className={`w-full py-1 text-center text-xs rounded-md ${ButtonStyles.transaction.text} ${ButtonStyles.transaction.hoverBackground}`}
                      onClick={addInputItem}
                    >
                      Add
                    </button>
                  </td>
                </tr>
              )}
            </>
          )}
        </tbody>
      </table>
    </>
  );
};
