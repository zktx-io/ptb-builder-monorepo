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
import { PTBNodeData, TYPE_ARRAY, TYPE_PARAMS } from '../nodes/types';

interface CmdParamsSplitProps {
  id: string;
  input1: {
    label: string;
    type: TYPE_PARAMS | 'number';
  };
  input2: {
    label: string;
    type: TYPE_ARRAY | 'number[]';
  };
  output: {
    label: string;
    type: TYPE_ARRAY | 'number[]';
  };
  data: PTBNodeData;
  resetEdge: (handle: 'source' | 'target') => void;
  updateState: (paramLength: (number | undefined)[]) => void;
}

export const CmdParamsSplitCoins = ({
  id,
  input1,
  input2,
  output,
  data,
  resetEdge,
  updateState,
}: CmdParamsSplitProps) => {
  const { canEdit } = useStateContext();
  const updateNodeInternals = useUpdateNodeInternals();

  const [isSplitInputs, setIsSplitInputs] = useState<boolean>(
    !!data.splitInputs || false,
  );
  const [inputs, setInputs] = useState<string[]>(
    data.splitInputs ? new Array(data.splitInputs).fill('') : [],
  );
  const [isNestedOutputs, setIsNestedOutputs] = useState<boolean>(
    !!data.splitOutputs || false,
  );
  const [outputs, setOutputs] = useState<string[]>(
    data.splitOutputs ? new Array(data.splitInputs).fill('') : [],
  );

  const addInputItem = () => {
    setInputs((oldData) => [...oldData, '']);
  };

  const removeInputItem = (index: number) => {
    if (inputs.length > 1) {
      resetEdge('target');
      setInputs((oldItems) => [...oldItems.filter((_, i) => i !== index)]);
    }
  };

  const addOutputItem = () => {
    setOutputs((oldData) => [...oldData, '']);
  };

  const removeOutputItem = (index: number) => {
    if (inputs.length > 1) {
      resetEdge('target');
      setOutputs((oldItems) => [...oldItems.filter((_, i) => i !== index)]);
    }
  };

  useEffect(() => {
    updateState([
      isSplitInputs ? inputs.length : undefined,
      isNestedOutputs ? inputs.length : undefined,
    ]);
  }, [inputs.length, isSplitInputs, isNestedOutputs, updateState]);

  useEffect(() => {
    updateNodeInternals(id);
  }, [id, updateNodeInternals]);

  return (
    <>
      <div className={FormTitleStyle}>
        <label className={LabelStyle}>inputs</label>
        {canEdit && (
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
              checked={isSplitInputs}
              onChange={(e) => {
                resetEdge('target');
                setIsSplitInputs(e.target.checked);
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
          {!isSplitInputs ? (
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
                    {canEdit && (
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
              {canEdit && (
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

      <div className={isSplitInputs ? '' : 'mt-2'}>
        <div className={FormTitleStyle}>
          <label className={LabelStyle}>ouputs</label>
          {canEdit && (
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
                checked={isNestedOutputs}
                onChange={(e) => {
                  resetEdge('source');
                  setIsNestedOutputs(e.target.checked);
                  if (e.target.checked) {
                    addOutputItem();
                  } else {
                    setOutputs([]);
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
            {!isNestedOutputs ? (
              <tr>
                <td
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                  }}
                >
                  <input
                    type="text"
                    placeholder={output.label}
                    autoComplete="off"
                    className={InputStyle}
                    readOnly
                  />
                  <PtbHandleArray
                    typeHandle="source"
                    typeParams={output.type as TYPE_ARRAY}
                    name={output.label}
                    style={{
                      top: `${inputs.length > 0 ? 106 + (canEdit ? 28 : 0) + 28 * inputs.length : 134 + (isSplitInputs ? 0 : 8)}px`,
                    }}
                  />
                </td>
              </tr>
            ) : (
              <>
                {outputs.map((_, index) => (
                  <tr key={index}>
                    <td
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                      }}
                    >
                      <input
                        type="text"
                        placeholder={output.label}
                        autoComplete="off"
                        className={InputStyle}
                        readOnly
                      />
                      <PtbHandle
                        typeHandle="source"
                        typeParams={output.type.replace('[]', '') as any}
                        name={`${output.label}[${index}]`}
                        style={{
                          top: `${106 + (canEdit ? 28 : 0) + (isSplitInputs ? 0 : 8) + 28 * inputs.length + 28 * index}px`,
                        }}
                      />
                      {canEdit && (
                        <button
                          className={`text-center text-xs rounded-md ${ButtonStyles.transaction.text} ${ButtonStyles.transaction.hoverBackground}`}
                          style={{
                            minWidth: '20px',
                          }}
                          onClick={() => removeOutputItem(index)}
                        >
                          x
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {canEdit && (
                  <tr>
                    <td
                      style={{
                        display: 'flex',
                        justifyContent: 'flex-end',
                      }}
                    >
                      <button
                        className={`w-full py-1 text-center text-xs rounded-md ${ButtonStyles.transaction.text} ${ButtonStyles.transaction.hoverBackground}`}
                        onClick={addOutputItem}
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
      </div>
    </>
  );
};
