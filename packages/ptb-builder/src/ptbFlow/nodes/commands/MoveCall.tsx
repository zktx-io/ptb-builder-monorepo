import React, { useEffect, useState } from 'react';

import {
  SuiMoveAbilitySet,
  SuiMoveNormalizedFunction,
  SuiMoveNormalizedModule,
  SuiMoveNormalizedType,
} from '@mysten/sui/client';
import { useReactFlow, useUpdateNodeInternals } from '@xyflow/react';

import { PTBNodeProp } from '..';
import { useStateContext } from '../../../provider';
import { CmdParamsMoveCall, getPackageData } from '../../components';
import { PtbHandleProcess } from '../handles';
import {
  ButtonStyles,
  FormStyle,
  InputStyle,
  LabelStyle,
  NodeStyles,
} from '../styles';

const deleteTxContext = (
  types: SuiMoveNormalizedType[],
): SuiMoveNormalizedType[] => {
  return types.filter((type) => {
    if (typeof type === 'object') {
      const struct =
        (type as any).MutableReference?.Struct ||
        (type as any).Reference?.Struct ||
        (type as any).Struct;
      return !(
        struct &&
        struct.address === '0x2' &&
        struct.module === 'tx_context' &&
        struct.name === 'TxContext'
      );
    }
    return true;
  });
};

export const MoveCall = ({ id, data }: PTBNodeProp) => {
  const { client } = useStateContext();
  const { setEdges } = useReactFlow();
  const { isEditor } = useStateContext();
  const updateNodeInternals = useUpdateNodeInternals();

  const [packageId, setPackageId] = useState<string>(
    data.moveCall?.package || '',
  );
  const [selectedModule, setSelectedModule] = useState<string>(
    data.moveCall?.module || '',
  );
  const [selectedFunction, setSelectedFunction] = useState<string>(
    data.moveCall?.function || '',
  );

  const [packageData, setPackageData] = useState<
    Record<string, SuiMoveNormalizedModule> | undefined
  >(undefined);
  const [functions, setFunctions] = useState<string[]>([]);
  const [dictionary, setDictionary] = useState<
    Record<string, SuiMoveNormalizedFunction>
  >({});

  const [selectedAbility, setSelectedAbility] = useState<SuiMoveAbilitySet[]>(
    [],
  );
  const [selectedInputs, setSelectedInputs] = useState<SuiMoveNormalizedType[]>(
    [],
  );
  const [selectedOutputs, setSelectedOutputs] = useState<
    SuiMoveNormalizedType[]
  >([]);

  const loadPackage = async () => {
    if (client && !!packageId) {
      const initPackageData = await getPackageData(client, packageId);

      if (initPackageData && Object.keys(initPackageData).length > 0) {
        setPackageData(initPackageData);
        const initModule = Object.keys(initPackageData)[0];
        setSelectedModule(initModule);

        const initFunctions: string[] = [];
        const initDictionary: Record<string, SuiMoveNormalizedFunction> = {};
        Object.keys(initPackageData[initModule].exposedFunctions)
          .filter(
            (item) =>
              initPackageData[initModule].exposedFunctions[item].visibility ===
                'Public' ||
              initPackageData[initModule].exposedFunctions[item].isEntry,
          )
          .forEach((item) => {
            initFunctions.push(item);
            initDictionary[item] =
              initPackageData[initModule].exposedFunctions[item];
          });
        setFunctions(initFunctions);
        setDictionary(initDictionary);
        setSelectedFunction(initFunctions.length > 0 ? initFunctions[0] : '');
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
      const selected = dictionary[selectedFunction];
      if (selected) {
        const inputs = deleteTxContext(selected.parameters);
        setSelectedOutputs(() => selected.return);
        setSelectedAbility(() => selected.typeParameters);
        setSelectedInputs(() => inputs);
        data.moveCall = {
          package: packageId,
          module: selectedModule,
          function: selectedFunction,
        };
        data.getMoveCallInputs = () => inputs;
        data.getIoLength = () => [
          selected.typeParameters.length,
          inputs.length,
          selected.return.length,
        ];
      } else {
        !!packageData && setSelectedOutputs([]);
        !!packageData && setSelectedAbility([]);
        !!packageData && setSelectedInputs([]);
        data.getMoveCallInputs = undefined;
        data.moveCall = undefined;
        data.getIoLength = () => [0, 0, 0];
      }
    } else {
      setSelectedOutputs([]);
      setSelectedAbility([]);
      setSelectedInputs([]);
      data.getMoveCallInputs = undefined;
      data.moveCall = undefined;
      data.getIoLength = () => [0, 0, 0];
    }
    updateNodeInternals(id);
  }, [
    data,
    dictionary,
    id,
    packageData,
    packageId,
    selectedFunction,
    selectedModule,
    updateNodeInternals,
  ]);

  return (
    <div className={NodeStyles.moveCall}>
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
            className={`w-full py-1 text-center text-xs rounded-md ${ButtonStyles.command.text} ${ButtonStyles.command.hoverBackground}`}
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
                  const selected = evt.target.value;
                  setSelectedModule(() => selected);
                  const initFunctions: string[] = [];
                  const initDictionary: Record<
                    string,
                    SuiMoveNormalizedFunction
                  > = {};
                  Object.keys(packageData[selected].exposedFunctions)
                    .filter(
                      (item) =>
                        packageData[selected].exposedFunctions[item]
                          .visibility === 'Public',
                    )
                    .forEach((item) => {
                      initFunctions.push(item);
                      initDictionary[item] =
                        packageData[selected].exposedFunctions[item];
                    });
                  setFunctions(initFunctions);
                  setDictionary(initDictionary);
                  setSelectedFunction(
                    initFunctions.length > 0 ? initFunctions[0] : '',
                  );
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
                  <option value={item} key={key}>
                    {item}
                  </option>
                ))
              ) : (
                <option>{selectedFunction}</option>
              )}
            </select>
          </>
        )}
        <div>
          {(selectedInputs.length > 0 || selectedAbility.length > 0) && (
            <>
              <p className="text-base text-center text-gray-700 dark:text-gray-400 mt-3">
                input
              </p>
              <CmdParamsMoveCall
                prefix="Input"
                typeHandle="target"
                types={selectedAbility}
                params={selectedInputs}
                yPosition={221}
              />
            </>
          )}
        </div>

        <div>
          {selectedOutputs.length > 0 && (
            <>
              <p className="text-base text-center text-gray-700 dark:text-gray-400 mt-3">
                output
              </p>
              <CmdParamsMoveCall
                prefix="Output"
                typeHandle="source"
                types={[]}
                params={selectedOutputs}
                yPosition={
                  selectedInputs.length + selectedAbility.length > 0
                    ? 260 +
                      (selectedInputs.length + selectedAbility.length) * 42
                    : 221
                }
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
