import React, { useEffect, useState } from 'react';

import { useUpdateNodeInternals } from '@xyflow/react';

import { useStateContext } from '../../provider';
import { PtbHandle, PtbHandleArray, PtbHandleVector } from '../nodes/handles';
import {
  ButtonStyles,
  FormTitleStyle,
  InputStyle,
  LabelStyle,
} from '../nodes/styles';
import {
  NumericTypes,
  PTBNodeData,
  TYPE_ARRAY,
  TYPE_PARAMS,
  TYPE_VECTOR,
} from '../nodes/types';

interface CmdParamsVectorProps {
  id: string;
  type: TYPE_PARAMS;
  data: PTBNodeData;
  resetEdge: (handle: 'source' | 'target') => void;
  updateState: (type: TYPE_PARAMS, splitInputs?: number) => void;
}

const PARAMS: TYPE_PARAMS[] = [
  'address',
  'string',
  'u8',
  'u16',
  'u32',
  'u64',
  'u128',
  'u256',
  'bool',
  'object',
];

export const CmdParamsVector = ({
  id,
  type,
  data,
  resetEdge,
  updateState,
}: CmdParamsVectorProps) => {
  const { canEdit } = useStateContext();
  const updateNodeInternals = useUpdateNodeInternals();

  const [isSplitInputs, setIsSplitInputs] = useState<boolean>(
    !!data.splitInputs || false,
  );
  const [inputs, setInputs] = useState<string[]>(
    data.splitInputs ? new Array(data.splitInputs).fill('') : [],
  );

  const handleResetEdge = (handle: 'source' | 'target') => {
    resetEdge(handle);
    updateNodeInternals(id);
  };

  const selectType = (type: TYPE_PARAMS) => {
    resetEdge('target');
    resetEdge('source');
    updateState(type, isSplitInputs ? inputs.length : undefined);
    updateNodeInternals(id);
  };

  const addInputItem = (checkeck: boolean) => {
    if (checkeck) {
      setInputs((oldData) => [...oldData, '']);
      updateState(
        type,
        checkeck || isSplitInputs ? inputs.length + 1 : undefined,
      );
    } else {
      setInputs([]);
      updateState(type, undefined);
    }
  };

  const removeInputItem = (index: number) => {
    if (inputs.length > 1) {
      resetEdge('target');
      setInputs((oldItems) => [...oldItems.filter((_, i) => i !== index)]);
      updateState(type, inputs.length - 1);
      updateNodeInternals(id);
    }
  };

  useEffect(() => {
    updateState(type, isSplitInputs ? inputs.length : undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
                handleResetEdge('target');
                setIsSplitInputs(e.target.checked);
                addInputItem(e.target.checked);
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
              <select
                className={InputStyle}
                disabled={!canEdit}
                value={type}
                onChange={(evt) => {
                  selectType(evt.target.value as TYPE_PARAMS);
                }}
              >
                {PARAMS.map((param, key) => (
                  <option key={key} value={param}>
                    {param}
                  </option>
                ))}
              </select>
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
                  placeholder={`${type}[]`}
                  autoComplete="off"
                  className={InputStyle}
                  readOnly
                />
                <PtbHandleArray
                  typeHandle="target"
                  typeParams={
                    `${NumericTypes.has(type) ? 'number' : type}[]` as TYPE_ARRAY
                  }
                  name="elements"
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
                      placeholder={type}
                      autoComplete="off"
                      className={InputStyle}
                      readOnly
                    />
                    <PtbHandle
                      typeHandle="target"
                      typeParams={
                        NumericTypes.has(type)
                          ? 'number'
                          : (type as TYPE_PARAMS)
                      }
                      name={`elements[${index}]`}
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
                  placeholder={`vector<${type}>`}
                  autoComplete="off"
                  className={InputStyle}
                  readOnly
                />
                <PtbHandleVector
                  typeHandle="source"
                  typeParams={`vector<${type}>` as TYPE_VECTOR}
                  name="result"
                  style={{
                    top: `${inputs.length > 0 ? 106 + (canEdit ? 28 : 0) + 28 * inputs.length : 134 + (isSplitInputs ? 0 : 8)}px`,
                  }}
                />
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </>
  );
};
