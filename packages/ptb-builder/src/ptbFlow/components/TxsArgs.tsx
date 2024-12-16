import React, { forwardRef, useImperativeHandle, useState } from 'react';

import { useStateContext } from '../../provider';
import { PtbHandle, PtbHandleArray, PtbHandleVector } from '../nodes/handles';
import { extractName } from '../nodes/isType';
import {
  ButtonStyles,
  FormTitleStyle,
  InputStyle,
  LabelStyle,
} from '../nodes/styles';
import { PTBEdge, TYPE_ARRAY, TYPE_PARAMS, TYPE_VECTOR } from '../nodes/types';

const isTypeArray = (type: string) => type.includes('[]');

const getArgsFromHandle = (
  length: number,
  dictionary: Record<string, string>,
  edges: PTBEdge[],
  regex: RegExp,
): string | string[] => {
  const extracted = edges
    .filter((edge) => regex.test(edge.targetHandle!))
    .map((edge) => {
      const match = edge.targetHandle!.match(regex);
      const index = parseInt(match![1], 10);
      return { index, edge };
    })
    .sort((a, b) => a.index - b.index);
  const args: string[] = Array(length).fill('undefined');
  extracted.forEach(({ index, edge }) => {
    args[index] =
      edge && edge.sourceHandle
        ? extractName(dictionary[edge.source], edge.sourceHandle)
        : 'undefined';
  });
  return args;
};

export interface TxsArgsHandles {
  getArgs: (
    dictionary: Record<string, string>,
    edges: PTBEdge[],
  ) => {
    arg1: string;
    arg2: string | string[];
  };
}

interface TxsArgsProps {
  resetEdge: (handle: 'source' | 'target') => void;
  input1: {
    label: string;
    type: TYPE_PARAMS;
  };
  input2: {
    label: string;
    type: TYPE_ARRAY;
  };
  output?: {
    label: string;
    type: TYPE_ARRAY | TYPE_VECTOR;
  };
}

export const TxsArgs = forwardRef<TxsArgsHandles, TxsArgsProps>(
  ({ resetEdge, input1, input2, output }: TxsArgsProps, ref) => {
    const { isEditor } = useStateContext();

    const [isArrayInputs, setIsArrayInputs] = useState<boolean>(false);
    const [inputs, setInputs] = useState<string[]>([]);

    const [isArrayOutputs, setIsArrayOutputs] = useState<boolean>(false);
    const [outputs, setOutputs] = useState<string[]>([]);

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

    const getArgs = (
      dictionary: Record<string, string>,
      edges: PTBEdge[],
    ): {
      arg1: string;
      arg2: string | string[];
    } => {
      const temp1 = edges.find(
        (item) => item.targetHandle === `${input1.label}:${input1.type}`,
      );
      const arg1 =
        temp1 && temp1.sourceHandle
          ? extractName(dictionary[temp1.source], temp1.sourceHandle)
          : 'undefined';
      if (isArrayInputs) {
        const arg2 = getArgsFromHandle(
          inputs.length,
          dictionary,
          edges,
          new RegExp(`${input2.label}-(\\d+):${input2.type.replace('[]', '')}`),
        );
        return { arg1, arg2 };
      }
      const temp2 = edges.find(
        (item) => item.targetHandle === `${input2.label}:${input2.type}`,
      );
      const arg2 =
        temp2 && temp2.sourceHandle
          ? extractName(dictionary[temp2.source], temp2.sourceHandle)
          : 'undefined';
      return { arg1, arg2 };
    };

    useImperativeHandle(ref, () => ({
      getArgs,
    }));

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
                nested
              </label>
              <input
                type="checkbox"
                id="checkbox"
                checked={isArrayInputs}
                onChange={(e) => {
                  resetEdge('target');
                  setIsArrayInputs(e.target.checked);
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
            {!isArrayInputs ? (
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
                      <PtbHandle
                        typeHandle="target"
                        typeParams={input2.type.replace('[]', '') as any}
                        name={`${input2.label}-${index}`}
                        style={{ top: `${90 + 28 * index}px` }}
                      />
                      <input
                        type="text"
                        placeholder={input2.label}
                        autoComplete="off"
                        className={InputStyle}
                        readOnly
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

        {output && (
          <div className={isArrayInputs ? '' : 'mt-2'}>
            <div className={FormTitleStyle}>
              <label className={LabelStyle}>ouputs</label>
              {isEditor && isTypeArray(output.type) && (
                <div className="flex items-center">
                  <label
                    htmlFor="checkbox"
                    className="text-xs text-gray-900 dark:text-gray-100 mr-1"
                  >
                    nested
                  </label>
                  <input
                    type="checkbox"
                    id="checkbox"
                    checked={isArrayOutputs}
                    onChange={(e) => {
                      resetEdge('source');
                      setIsArrayOutputs(e.target.checked);
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
                {!isArrayOutputs || !isTypeArray(output.type) ? (
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
                      {isTypeArray(output.type) ? (
                        <PtbHandleArray
                          typeHandle="source"
                          typeParams={output.type as TYPE_ARRAY}
                          name={output.label}
                          style={{
                            top: `${inputs.length > 0 ? 134 + 28 * inputs.length : 134 + (isArrayInputs ? 0 : 8)}px`,
                          }}
                        />
                      ) : (
                        <PtbHandleVector
                          typeHandle="source"
                          typeParams={output.type as TYPE_VECTOR}
                          name={output.label}
                          style={{
                            top: `${inputs.length > 0 ? 134 + 28 * inputs.length : 134 + (isArrayInputs ? 0 : 8)}px`,
                          }}
                        />
                      )}
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
                          <PtbHandle
                            typeHandle="source"
                            typeParams={output.type.replace('[]', '') as any}
                            name={`${output.label}-${index}`}
                            style={{
                              top: `${134 + (isArrayInputs ? 0 : 8) + 28 * inputs.length + 28 * index}px`,
                            }}
                          />
                          <input
                            type="text"
                            placeholder={output.label}
                            autoComplete="off"
                            className={InputStyle}
                            readOnly
                          />
                          {isEditor && (
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
        )}
      </>
    );
  },
);
