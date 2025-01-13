import React, { useEffect, useState } from 'react';

import { useUpdateNodeInternals } from '@xyflow/react';

import { useStateContext } from '../../provider';
import { PtbHandle, PtbHandleArray } from '../nodes/handles';
import { ButtonStyles } from '../nodes/styles';
import { PTBNodeData, TYPE_ARRAY, TYPE_PARAMS } from '../nodes/types';

const YStart = 80;
const YGap = 24;

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
  updateState: (splitInputs: number | undefined) => void;
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
  const [outputs, setOutputs] = useState<string[]>(
    data.splitInputs ? new Array(data.splitInputs).fill('') : [],
  );

  const handleAdd = (check: boolean) => {
    if (check) {
      setInputs((old) => [...old, '']);
      setOutputs((old) => [...old, '']);
      updateState(inputs.length + 1);
    } else {
      setInputs([]);
      setOutputs([]);
      updateState(undefined);
    }
  };

  const handleRemove = () => {
    if (inputs.length > 1) {
      setInputs((old) => old.slice(0, -1));
      setOutputs((old) => old.slice(0, -1));
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
      {!isSplitInputs ? (
        <PtbHandleArray
          label={output.label}
          tootlip={output.type}
          typeHandle="source"
          typeParams={output.type as TYPE_ARRAY}
          name={output.label}
          style={{ top: `${YStart}px` }}
        />
      ) : (
        <>
          {outputs.map((_, index) => (
            <PtbHandle
              key={`outputs-${index}`}
              label={`${output.label}[${index}]`}
              tootlip={output.type.replace('[]', '') as any}
              typeHandle="source"
              typeParams={output.type.replace('[]', '') as any}
              name={`${output.label}[${index}]`}
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
