import React, { useEffect, useState } from 'react';

import { useUpdateNodeInternals } from '@xyflow/react';

import { useStateContext } from '../../provider';
import { PtbHandle, PtbHandleArray } from '../nodes/handles';
import { ButtonStyles } from '../nodes/styles';
import { PTBNodeData, TYPE_ARRAY, TYPE_PARAMS } from '../nodes/types';

const YStart = 80;
const YGap = 24;

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
  data: PTBNodeData;
  resetEdge: (handle: 'source' | 'target') => void;
  updateState: (splitInputs?: number) => void;
}

export const CmdParams = ({
  id,
  input1,
  input2,
  data,
  resetEdge,
  updateState,
}: CmdParamsProps) => {
  const { canEdit } = useStateContext();
  const updateNodeInternals = useUpdateNodeInternals();

  const [isSplitInputs, setIsSplitInputs] = useState<boolean>(
    !!data.splitInputs || false,
  );
  const [inputs, setInputs] = useState<string[]>(
    data.splitInputs ? new Array(data.splitInputs).fill('') : [],
  );

  const handleAdd = (check: boolean) => {
    if (check) {
      setInputs((old) => [...old, '']);
      updateState(inputs.length + 1);
    } else {
      setInputs([]);
      updateState(undefined);
    }
  };

  const handleRemove = () => {
    if (inputs.length > 1) {
      setInputs((old) => old.slice(0, -1));
      updateState(inputs.length - 1);
    }
  };

  const handleResetEdge = (handle: 'source' | 'target') => {
    resetEdge(handle);
    updateNodeInternals(id);
  };

  useEffect(() => {
    updateNodeInternals(id);
  }, [id, updateNodeInternals]);

  return (
    <>
      <div className="flex items-center justify-end w-full mt-4">
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

      <PtbHandle
        label={input1.label}
        tootlip={input1.type}
        typeHandle="target"
        typeParams={input1.type}
        name={input1.label}
        style={{ top: '56px' }}
      />
      {!isSplitInputs ? (
        <PtbHandleArray
          label={input2.label}
          tootlip={input2.type}
          typeHandle="target"
          typeParams={input2.type}
          name={input2.label}
          style={{ top: `${YStart}px` }}
        />
      ) : (
        <>
          {inputs.map((_, index) => (
            <PtbHandle
              key={`inputs-${index}`}
              label={`${input2.label}[${index}]`}
              tootlip={input2.type.replace('[]', '') as any}
              typeHandle="target"
              typeParams={input2.type.replace('[]', '') as any}
              name={`${input2.label}[${index}]`}
              style={{ top: `${YStart + YGap * index}px` }}
            />
          ))}
        </>
      )}
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
