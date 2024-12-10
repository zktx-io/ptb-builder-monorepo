import React, { useEffect, useState } from 'react';

import {
  SuiMoveNormalizedFunction,
  SuiMoveNormalizedModule,
} from '@mysten/sui/client';
import { Transaction } from '@mysten/sui/transactions';
import { useReactFlow, useUpdateNodeInternals } from '@xyflow/react';

import { PTBNodeProp } from '..';
import { FuncArg, MoveCallArg } from '../../../Components/MoveCallArg';
import { useStateContext } from '../../../Provider';
import { enqueueToast } from '../../../Provider/toastManager';
import { getMoveCallFuncArg } from '../../../utilities/getMoveCallFuncArg';
import { loadPackageData } from '../../../utilities/loadPackageData';
import { removeTxContext } from '../../../utilities/removeTxContext';
import { PtbHandleProcess } from '../handles';
import {
  ButtonStyles,
  FormStyle,
  InputStyle,
  LabelStyle,
  NodeStyles,
} from '../styles';
import { CodeParam } from '../types';

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

  return (
    <div className={NodeStyles.transaction}>
      <p className="text-base text-center text-gray-700 dark:text-gray-400">
        {data.label}
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
              {selectedFunctionInputs.map((arg, index) => (
                <MoveCallArg
                  key={index}
                  index={index}
                  yPosition={221}
                  arg={arg}
                  typeHandle="target"
                  node="transactions"
                />
              ))}
            </>
          )}
        </div>

        <div>
          {selectedFunctionOutputs.length > 0 && (
            <>
              <p className="text-base text-center text-gray-700 dark:text-gray-400 mt-3">
                output
              </p>
              {selectedFunctionOutputs.map((arg, index) => (
                <MoveCallArg
                  key={index}
                  index={index}
                  yPosition={
                    selectedFunctionInputs.length > 0
                      ? 260 + selectedFunctionInputs.length * 42
                      : 221
                  }
                  arg={arg}
                  typeHandle="source"
                  node="inputs"
                />
              ))}
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
