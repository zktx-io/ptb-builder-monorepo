import React, { useEffect, useState } from 'react';

import { useUpdateNodeInternals } from '@xyflow/react';

import { useStateContext } from '../../provider';
import { PtbHandle, PtbHandleArray, PtbHandleVector } from '../nodes/handles';
import { ButtonStyles, InputStyle } from '../nodes/styles';
import {
  NumericTypes,
  PTBNodeData,
  TYPE_ARRAY,
  TYPE_PARAMS,
  TYPE_VECTOR,
} from '../nodes/types';

const YStart = 74;
const YGap = 24;

interface CmdParamsVectorProps {
  id: string;
  data: PTBNodeData;
  resetEdge: (handle: 'source' | 'target') => void;
  updateState: (type: TYPE_PARAMS, omit: boolean, splitInputs?: number) => void;
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
  const [type, setType] = useState<TYPE_PARAMS>(
    data.makeMoveVector?.type || 'object',
  );
  const [omit, setOmit] = useState<boolean>(
    !!data.makeMoveVector?.omit || false,
  );

  const selectType = (type: TYPE_PARAMS) => {
    resetEdge('target');
    resetEdge('source');
    setType(type);
    updateState(type, omit, isSplitInputs ? inputs.length : undefined);
  };

  const handleAdd = (checkeck: boolean) => {
    if (checkeck) {
      setInputs((old) => [...old, '']);
      updateState(
        type,
        omit,
        checkeck || isSplitInputs ? inputs.length + 1 : undefined,
      );
    } else {
      setInputs([]);
      updateState(type, omit, undefined);
    }
  };

  const handleRemove = () => {
    if (inputs.length > 1) {
      resetEdge('target');
      setInputs((old) => old.slice(0, -1));
      updateState(type, omit, inputs.length - 1);
      updateNodeInternals(id);
    }
  };

  useEffect(() => {
    updateState(type, omit, isSplitInputs ? inputs.length : undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleResetEdge = (handle: 'source' | 'target') => {
    resetEdge(handle);
    updateNodeInternals(id);
  };

  useEffect(() => {
    updateNodeInternals(id);
  }, [id, updateNodeInternals]);

  return (
    <>
      <div className="flex items-center gap-2">
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
        <input
          type="checkbox"
          title="omit type"
          checked={omit}
          onChange={(e) => {
            setOmit(e.target.checked);
            updateState(type, e.target.checked, inputs.length);
          }}
        />
      </div>

      <div className="flex items-center justify-end w-full mt-2">
        {canEdit && (
          <>
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
                handleAdd(e.target.checked);
                handleResetEdge('target');
              }}
            />
          </>
        )}
      </div>
      {!isSplitInputs ? (
        <PtbHandleArray
          label="elements"
          typeHandle="target"
          typeParams={
            `${NumericTypes.has(type) ? 'number' : type}[]` as TYPE_ARRAY
          }
          name="elements"
          style={{ top: `${YStart + YGap}px` }}
        />
      ) : (
        <>
          {inputs.map((_, index) => (
            <PtbHandle
              key={`inputs-${index}`}
              label={`elements[${index}]`}
              typeHandle="target"
              typeParams={
                NumericTypes.has(type) ? 'number' : (type as TYPE_PARAMS)
              }
              name={`elements[${index}]`}
              style={{ top: `${YStart + YGap * (index + 1)}px` }}
            />
          ))}
        </>
      )}
      <PtbHandleVector
        label="result"
        tootlip={`vector<${type}>`}
        typeHandle="source"
        typeParams={`vector<${type}>` as TYPE_VECTOR}
        name="result"
        style={{ top: `${YStart + YGap}px` }}
      />
      <div
        style={{
          width: '100%',
          height: (inputs.length || 1) * 24 + (canEdit ? 8 : 24),
        }}
      />
      {canEdit && isSplitInputs && (
        <div className="flex w-full border-1 border-stone-300 dark:border-stone-700 rounded-md">
          <button
            className={`flex-1 py-1 text-center text-xs rounded-l-md ${ButtonStyles.command.text} ${ButtonStyles.command.hoverBackground}`}
            onClick={() => handleAdd(true)}
          >
            Add
          </button>
          <button
            className={`flex-1 py-1 text-center text-xs rounded-r-md ${ButtonStyles.command.text} ${ButtonStyles.command.hoverBackground}`}
            onClick={handleRemove}
          >
            Delete
          </button>
        </div>
      )}
    </>
  );
};
