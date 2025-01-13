import React, { useCallback, useEffect, useState } from 'react';

import { SuiMoveAbilitySet } from '@mysten/sui/client';
import { useReactFlow, useUpdateNodeInternals } from '@xyflow/react';

import { PTBNodeProp } from '..';
import { useStateContext } from '../../../provider';
import { CmdParamsMoveCall } from '../../components';
import { convertParams, Handle } from '../../components/CmdParamsMoveCall';
import { PtbHandleProcess } from '../handles';
import {
  ButtonStyles,
  FormStyle,
  InputStyle,
  LabelStyle,
  NodeStyles,
} from '../styles';
import { PTBModuleData, PTBMoveCall } from '../types';

export const MoveCall = ({ id, data }: PTBNodeProp) => {
  const { fetchPackageData } = useStateContext();
  const { setEdges, setNodes } = useReactFlow();
  const { canEdit } = useStateContext();
  const updateNodeInternals = useUpdateNodeInternals();

  const [packageData, setPackageData] = useState<PTBModuleData | undefined>(
    undefined,
  );

  const [packageId, setPackageId] = useState<string>('');
  const [selectedModule, setSelectedModule] = useState<string>('');
  const [selectedFunction, setSelectedFunction] = useState<string>('');
  const [selectedAbility, setSelectedAbility] = useState<SuiMoveAbilitySet[]>(
    [],
  );
  const [selectedInputs, setSelectedInputs] = useState<Handle[]>([]);
  const [selectedOutputs, setSelectedOutputs] = useState<Handle[]>([]);
  const [selectedTypeArgs, setSelectedTypeArgs] = useState<string[]>([]);

  const loadPackage = async () => {
    if (!!packageId && fetchPackageData) {
      const temp = await fetchPackageData(packageId);
      setPackageData(temp);
      if (temp) {
        const func =
          (temp._nameModules_[0] &&
            temp.modules[temp._nameModules_[0]]._nameFunctions_[0]) ||
          '';
        updateNode(temp, {
          package: packageId,
          module: temp._nameModules_[0],
          function: func,
          getTypeArgs: () => selectedTypeArgs,
        });
      }
    }
  };

  const updateNode = useCallback(
    (
      ptbModuleData: PTBModuleData,
      moveCallData: {
        package: string;
        module: string;
        function: string;
        getTypeArgs?: () => string[];
      },
    ) => {
      setSelectedModule(moveCallData.module);
      setSelectedFunction(moveCallData.function);
      if (moveCallData.getTypeArgs) {
        setSelectedTypeArgs(moveCallData.getTypeArgs());
        moveCallData.getTypeArgs = () => selectedTypeArgs;
      }
      if (moveCallData.module && moveCallData.function) {
        setSelectedAbility(
          ptbModuleData.modules[moveCallData.module].exposedFunctions[
            moveCallData.function
          ].typeParameters,
        );
        setSelectedInputs(
          convertParams(
            'target',
            'input',
            ptbModuleData.modules[moveCallData.module].exposedFunctions[
              moveCallData.function
            ].parameters,
            selectedTypeArgs,
          ),
        );
        convertParams(
          'source',
          'result',
          ptbModuleData.modules[moveCallData.module].exposedFunctions[
            moveCallData.function
          ].return,
          selectedTypeArgs,
        );
      }
      setNodes((nds) =>
        nds.map((node) => {
          if (node.id === id) {
            return {
              ...node,
              data: {
                ...node.data,
                moveCall: {
                  ...moveCallData,
                },
              },
            };
          }
          return node;
        }),
      );
      setTimeout(() => {
        updateNodeInternals(id);
      }, 5);
    },
    [id, selectedTypeArgs, setNodes, updateNodeInternals],
  );

  useEffect(() => {
    const init = async (moveCall: PTBMoveCall) => {
      if (
        fetchPackageData &&
        moveCall.package &&
        moveCall.module &&
        moveCall.function
      ) {
        setPackageId(moveCall.package);
        setSelectedModule(moveCall.module);
        setSelectedFunction(moveCall.function);
        const temp = await fetchPackageData(moveCall.package);
        setPackageData(temp);
        if (temp) {
          updateNode(temp, {
            package: moveCall.package,
            module: moveCall.module,
            function: moveCall.function,
            getTypeArgs: moveCall.getTypeArgs,
          });
        }
      }
    };
    data.moveCall && init(data.moveCall);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const resetEdge = () => {
    setEdges((eds) =>
      eds.filter(
        (edge) =>
          !((edge.target === id || edge.source === id) && edge.type === 'Data'),
      ),
    );
    updateNodeInternals(id);
  };

  useEffect(() => {
    updateNodeInternals(id);
  }, [id, updateNodeInternals]);

  return (
    <div className={NodeStyles.command}>
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
          readOnly={!!packageData || !canEdit}
          disabled={!canEdit}
          onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
            setPackageId(() => event.target.value);
          }}
        />
        {!packageData && canEdit && (
          <button
            className={`w-full py-1 text-center text-xs rounded-md ${ButtonStyles.command.text} ${ButtonStyles.command.hoverBackground}`}
            disabled={!canEdit}
            onClick={loadPackage}
          >
            Load
          </button>
        )}
        {(!!packageData || !canEdit) && (
          <>
            <label className={LabelStyle} style={{ fontSize: '0.6rem' }}>
              Module
            </label>
            <select
              className={InputStyle}
              value={selectedModule}
              disabled={!canEdit}
              onChange={(evt) => {
                updateNode(packageData!, {
                  package: packageId,
                  module: evt.target.value,
                  function:
                    packageData!.modules[evt.target.value]._nameFunctions_[0] ||
                    '',
                  getTypeArgs: () => selectedTypeArgs,
                });
                resetEdge();
              }}
            >
              {packageData ? (
                packageData._nameModules_.map((item, key) => (
                  <option value={item} key={key}>
                    {item}
                  </option>
                ))
              ) : (
                <option></option>
              )}
            </select>
            <label className={LabelStyle} style={{ fontSize: '0.6rem' }}>
              Function
            </label>
            <select
              className={InputStyle}
              value={selectedFunction}
              disabled={!canEdit}
              onChange={(evt) => {
                updateNode(packageData!, {
                  package: packageId,
                  module: selectedModule,
                  function: evt.target.value,
                  getTypeArgs: () => selectedTypeArgs,
                });
                resetEdge();
              }}
            >
              {packageData ? (
                packageData!.modules[selectedModule]._nameFunctions_.map(
                  (item, key) => (
                    <option value={item} key={key}>
                      {item}
                    </option>
                  ),
                )
              ) : (
                <option></option>
              )}
            </select>
          </>
        )}
        <div>
          {(selectedInputs.length > 0 || selectedAbility.length > 0) && (
            <CmdParamsMoveCall
              typeHandle="target"
              types={selectedAbility}
              params={selectedInputs}
            />
          )}
        </div>

        <div>
          {selectedOutputs.length > 0 && (
            <CmdParamsMoveCall
              typeHandle="source"
              types={[]}
              params={selectedOutputs}
            />
          )}
        </div>

        {!!selectedFunction && (
          <div
            style={{
              height:
                Math.max(
                  selectedOutputs.length,
                  selectedInputs.length + selectedAbility.length,
                ) *
                  24 +
                18,
            }}
          />
        )}
      </div>

      <PtbHandleProcess
        typeHandle="target"
        style={{
          top: !!packageData || !canEdit ? '147px' : '65px',
        }}
      />
      <PtbHandleProcess
        typeHandle="source"
        style={{
          top: !!packageData || !canEdit ? '147px' : '65px',
        }}
      />
    </div>
  );
};
