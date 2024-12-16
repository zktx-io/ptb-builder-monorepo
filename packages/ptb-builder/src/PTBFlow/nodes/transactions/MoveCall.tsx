import React, { useCallback, useEffect, useState } from 'react';

import {
  SuiMoveNormalizedFunction,
  SuiMoveNormalizedModule,
} from '@mysten/sui/client';
import { Transaction } from '@mysten/sui/transactions';
import { Position, useReactFlow, useUpdateNodeInternals } from '@xyflow/react';

import { PTBEdge, PTBNodeProp } from '..';
import { FuncArg, MoveCallArgs } from '../../../_Components/MoveCallArgs';
import { enqueueToast, useStateContext } from '../../../provider';
import { getMoveCallFuncArg } from '../../../utilities/getMoveCallFuncArg';
import { loadPackageData } from '../../../utilities/loadPackageData';
import { removeTxContext } from '../../../utilities/removeTxContext';
import { PtbHandleProcess } from '../handles';
import { extractName } from '../isType';
import {
  ButtonStyles,
  FormStyle,
  InputStyle,
  LabelStyle,
  NodeStyles,
} from '../styles';

const numericTypes = new Set(['U8', 'U16', 'U32', 'U64', 'U128', 'U256']);
const objectTypes = new Set([
  'Reference',
  'MutableReference',
  'Struct',
  'Vector',
]);

export const MoveCall = ({ id, data }: PTBNodeProp) => {
  const { client } = useStateContext();
  const { setEdges } = useReactFlow();
  const { isEditor } = useStateContext();
  const updateNodeInternals = useUpdateNodeInternals();

  const [packageId, setPackageId] = useState<string>(
    (data as any).package || '',
  );
  const [packageData, setPackageData] = useState<
    Record<string, SuiMoveNormalizedModule> | undefined
  >(undefined);
  const [functions, setFunctions] = useState<
    { name: string; func: SuiMoveNormalizedFunction }[]
  >([]);

  const [selectedModule, setSelectedModule] = useState<string>(
    (data.module as string) || '',
  );
  const [selectedFunction, setSelectedFunction] = useState<string>(
    (data.function as string) || '',
  );
  const [selectedFunctionInputs, setSelectedFunctionInputs] = useState<
    FuncArg[]
  >((data.inputs as FuncArg[]) || []);
  const [selectedFunctionOutputs, setSelectedFunctionOutputs] = useState<
    FuncArg[]
  >((data.outputs as FuncArg[]) || []);

  const loadPackage = async () => {
    if (client && !!packageId) {
      const temp = await loadPackageData(client, packageId);
      if (temp && Object.keys(temp)[0]) {
        setPackageData(temp);
        const select = Object.keys(temp)[0];
        setSelectedModule(select);
        const list = Object.keys(temp[select].exposedFunctions)
          .filter(
            (item) =>
              temp[select].exposedFunctions[item].visibility === 'Public',
          )
          .map((item) => ({
            name: item,
            func: temp[select].exposedFunctions[item],
          }));
        setFunctions(list);
        setSelectedFunction(!list[0] ? '' : list[0].name);
      } else {
        setPackageData(undefined);
        setSelectedModule('');
        setFunctions([]);
        setSelectedFunction('');
      }
    }
  };

  const resetEdge = () => {
    setEdges((eds) =>
      eds.filter(
        (edge) =>
          !((edge.target === id || edge.source === id) && edge.type === 'Data'),
      ),
    );
  };

  const code = useCallback(
    (dictionary: Record<string, string>, edges: PTBEdge[]): string => {
      if (selectedFunction) {
        const target = `'${packageId}::${selectedModule}:${selectedFunction}'`;
        const args: string[] = Array(selectedFunctionInputs.length).fill(
          'undefined',
        );
        selectedFunctionInputs.forEach((item, index) => {
          const temp = edges.find(
            (edge) => edge.targetHandle === `${item.id}:${item.type}`,
          );
          const arg: string =
            temp && temp.sourceHandle
              ? extractName(dictionary[temp.source], temp.sourceHandle)
              : 'undefined';
          args[index] = arg;
        });
        return `tx.moveCall({\n\ttarget: ${target},\n\targuments: [${args.join(', ')}],\n})`;
      }
      return `tx.moveCall({\n\ttarget: undefined,\n\targuments: undefined\n});`;
    },
    [packageId, selectedFunction, selectedFunctionInputs, selectedModule],
  );

  useEffect(() => {
    if (selectedFunction) {
      const find = functions.find((item) => item.name === selectedFunction);
      if (find) {
        setSelectedFunctionInputs(() =>
          removeTxContext(find.func).map(getMoveCallFuncArg),
        );
        setSelectedFunctionOutputs(find.func.return.map(getMoveCallFuncArg));
      } else {
        !!packageData && setSelectedFunctionInputs([]);
        !!packageData && setSelectedFunctionOutputs([]);
      }
    } else {
      setSelectedFunctionInputs([]);
      setSelectedFunctionOutputs([]);
    }
    updateNodeInternals(id);
  }, [
    functions,
    id,
    packageData,
    selectedFunction,
    setEdges,
    updateNodeInternals,
  ]);

  useEffect(() => {
    if (data) {
      data.code = code;
      // data.excute = excute;
    }
  }, [code, data]);

  return (
    <div className={NodeStyles.transaction}>
      <p className="text-base text-center text-gray-700 dark:text-gray-400">
        MoveCall
      </p>

      <div className={FormStyle}>
        <label className={LabelStyle} style={{ fontSize: '0.6rem' }}>
          Object ID
        </label>
        <input
          type="text"
          placeholder="Enter object id"
          value={packageId}
          autoComplete="off"
          className={InputStyle}
          readOnly={!!packageData || !isEditor}
          disabled={!isEditor}
          onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
            setPackageId(() => event.target.value);
          }}
        />
        {!packageData && isEditor && (
          <button
            className={`w-full py-1 text-center text-xs rounded-md ${ButtonStyles.process.text} ${ButtonStyles.process.hoverBackground}`}
            disabled={!isEditor}
            onClick={loadPackage}
          >
            Load
          </button>
        )}
        {(!!packageData || !isEditor) && (
          <>
            <label className={LabelStyle} style={{ fontSize: '0.6rem' }}>
              Module
            </label>
            <select
              className={InputStyle}
              value={selectedModule}
              disabled={!isEditor}
              onChange={(evt) => {
                if (packageData) {
                  const select = evt.target.value;
                  setSelectedModule(() => select);
                  const list = Object.keys(packageData[select].exposedFunctions)
                    .filter(
                      (item) =>
                        packageData[select].exposedFunctions[item]
                          .visibility === 'Public',
                    )
                    .map((item) => ({
                      name: item,
                      func: packageData[select].exposedFunctions[item],
                    }));
                  setFunctions(list);
                  setSelectedFunction(!list[0] ? '' : list[0].name);
                  resetEdge();
                }
              }}
            >
              {packageData ? (
                Object.keys(packageData).map((item, key) => (
                  <option value={item} key={key}>
                    {item}
                  </option>
                ))
              ) : (
                <option>{selectedModule}</option>
              )}
            </select>
            <label className={LabelStyle} style={{ fontSize: '0.6rem' }}>
              Function
            </label>
            <select
              className={InputStyle}
              value={selectedFunction}
              disabled={!isEditor}
              onChange={(evt) => {
                setSelectedFunction(evt.target.value);
                resetEdge();
              }}
            >
              {packageData ? (
                functions.map((item, key) => (
                  <option value={item.name} key={key}>
                    {item.name}
                  </option>
                ))
              ) : (
                <option>{selectedFunction}</option>
              )}
            </select>
          </>
        )}
        <div>
          {selectedFunctionInputs.length > 0 && (
            <>
              <p className="text-base text-center text-gray-700 dark:text-gray-400 mt-3">
                input
              </p>
              <MoveCallArgs
                prefix="input"
                typeHandle="target"
                args={selectedFunctionInputs}
                yPosition={221}
                position={Position.Left}
              />
            </>
          )}
        </div>

        <div>
          {selectedFunctionOutputs.length > 0 && (
            <>
              <p className="text-base text-center text-gray-700 dark:text-gray-400 mt-3">
                output
              </p>
              <MoveCallArgs
                prefix="output"
                typeHandle="source"
                args={selectedFunctionOutputs}
                yPosition={
                  selectedFunctionInputs.length > 0
                    ? 260 + selectedFunctionInputs.length * 42
                    : 221
                }
                position={Position.Right}
              />
            </>
          )}
        </div>
      </div>

      <PtbHandleProcess
        typeHandle="target"
        style={{
          top: !!packageData || !isEditor ? '147px' : '65px',
        }}
      />
      <PtbHandleProcess
        typeHandle="source"
        style={{
          top: !!packageData || !isEditor ? '147px' : '65px',
        }}
      />
    </div>
  );
};
