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
  updateState: (
    splitInputs: number | undefined,
    splitOutputs: number | undefined,
  ) => void;
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
  const [isSplitOutputs, setIsSplitOutputs] = useState<boolean>(
    !!data.splitOutputs || false,
  );
  const [outputs, setOutputs] = useState<string[]>(
    data.splitOutputs ? new Array(data.splitInputs).fill('') : [],
  );

  const handleResetEdge = (handle: 'source' | 'target') => {
    resetEdge(handle);
    updateNodeInternals(id);
  };

  const addInputItem = (check: boolean) => {
    if (check) {
      setInputs((oldData) => [...oldData, '']);
      updateState(
        inputs.length + 1,
        isSplitOutputs ? outputs.length : undefined,
      );
    } else {
      setInputs([]);
      updateState(undefined, isSplitOutputs ? outputs.length : undefined);
    }
  };

  const removeInputItem = (index: number) => {
    if (inputs.length > 1) {
      setInputs((oldItems) => [...oldItems.filter((_, i) => i !== index)]);
      updateState(
        inputs.length - 1,
        isSplitOutputs ? outputs.length : undefined,
      );
      handleResetEdge('target');
    }
  };

  const addOutputItem = (check: boolean) => {
    if (check) {
      setOutputs((oldData) => [...oldData, '']);
      updateState(
        isSplitInputs ? inputs.length : undefined,
        outputs.length + 1,
      );
    } else {
      setOutputs([]);
      updateState(isSplitInputs ? inputs.length : undefined, undefined);
    }
  };

  const removeOutputItem = (index: number) => {
    if (inputs.length > 1) {
      setOutputs((oldItems) => [...oldItems.filter((_, i) => i !== index)]);
      updateState(
        isSplitInputs ? inputs.length : undefined,
        outputs.length - 1,
      );
      handleResetEdge('target');
    }
  };

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
                setIsSplitInputs(e.target.checked);
                addInputItem(e.target.checked);
                handleResetEdge('target');
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
                      onClick={() => addInputItem(isSplitInputs)}
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
                checked={isSplitOutputs}
                onChange={(e) => {
                  setIsSplitOutputs(e.target.checked);
                  addOutputItem(e.target.checked);
                  handleResetEdge('source');
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
            {!isSplitOutputs ? (
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
                        onClick={() => addOutputItem(isSplitOutputs)}
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
