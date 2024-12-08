import React, { useCallback, useEffect, useState } from 'react';

import {
  SuiMoveNormalizedFunction,
  SuiMoveNormalizedModule,
} from '@mysten/sui/client';
import { Transaction } from '@mysten/sui/transactions';
import { Node, useReactFlow, useUpdateNodeInternals } from '@xyflow/react';

import { PTBNodeProp } from '..';
import { useStateContext } from '../../../Provider';
import { enqueueToast } from '../../../Provider/toastManager';
import { getTypeName } from '../../../utilities/getTypeName';
import { loadPackageData } from '../../../utilities/loadPackageData';
import { parameterFilter } from '../../../utilities/parameterFilter';
import { PtbHandle, PtbHandleProcess, PtbHandleVector } from '../handles';
import {
  ButtonStyles,
  FormStyle,
  InputStyle,
  LabelStyle,
  NodeStyles,
} from '../styles';
import { CodeParam } from '../types';

const PREFIX = 'param-';
const numericTypes = new Set(['U8', 'U16', 'U32', 'U64', 'U128', 'U256']);
const objectTypes = new Set(['Reference', 'MutableReference', 'Struct']);

export const MoveCall = ({ id, data }: PTBNodeProp) => {
  const { client } = useStateContext();
  const { setNodes, setEdges } = useReactFlow();
  const { isEditor } = useStateContext();
  const updateNodeInternals = useUpdateNodeInternals();

  const [packageId, setPackageId] = useState<string>(
    (data as any).package || '',
  );
  const [packageData, setPackageData] = useState<
    Record<string, SuiMoveNormalizedModule> | undefined
  >(undefined);
  const [functions, setFunctions] = useState<string[]>([]);

  const [selectedModule, setSelectedModule] = useState<string>(
    (data as any).module || '',
  );
  const [selectedFunction, setSelectedFunction] = useState<string>(
    (data as any).function || '',
  );

  const [selectedFunctionArgs, setSelectedFunctionArgs] = useState<
    {
      id: string;
      type:
        | 'address'
        | 'bool'
        | 'object'
        | 'number'
        | 'vector<u8>'
        | 'vector<u16>'
        | 'vector<u32>'
        | 'vector<u64>'
        | 'vector<u128>'
        | 'vector<u256>'
        | undefined;
      placeHolder: string;
      value: string;
    }[]
  >(
    (data as any).handles
      ? (data as any).handles.map((item: any) => ({
          ...item,
          value: item.value || '',
        }))
      : [],
  );

  const loadPackage = async () => {
    if (client && !!packageId) {
      const temp = await loadPackageData(client, packageId);
      if (temp && Object.keys(temp)[0]) {
        const select = Object.keys(temp)[0];
        setPackageData(temp);
        const list = Object.keys(temp[select].exposedFunctions).filter(
          (item) =>
            temp[select].exposedFunctions[item].isEntry ||
            temp[select].exposedFunctions[item].visibility === 'Public',
        );
        setSelectedModule(select);
        setFunctions(list);
        if (list.length > 0) {
          setArgumentHandles(list[0], temp[select].exposedFunctions[list[0]]);
        } else {
          setArgumentHandles('', undefined);
        }
      } else {
        setSelectedModule('');
        setFunctions([]);
        setArgumentHandles('', undefined);
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

  const setArgumentHandles = (
    name: string,
    data: SuiMoveNormalizedFunction | undefined,
  ) => {
    setSelectedFunction(() => name);
    setSelectedFunctionArgs(() => []);
    const temp = data ? parameterFilter(data) : [];
    setSelectedFunctionArgs(() =>
      temp.map((item, index) => {
        if (item === 'Address') {
          return {
            id: `${PREFIX}${index}`,
            type: 'address',
            placeHolder: getTypeName(item),
            value: '',
          };
        }
        if (item === 'Bool') {
          return {
            id: `${PREFIX}${index}`,
            type: 'bool',
            placeHolder: getTypeName(item),
            value: '',
          };
        }
        if (typeof item === 'string' && numericTypes.has(item)) {
          return {
            id: `${PREFIX}${index}`,
            type: 'number',
            placeHolder: getTypeName(item),
            value: '',
          };
        }
        if (objectTypes.has(Object.keys(item)[0])) {
          return {
            id: `${PREFIX}${index}`,
            type: 'object',
            placeHolder: getTypeName(item),
            value: '',
          };
        }
        return {
          id: `${PREFIX}${index}`,
          type: undefined,
          placeHolder: getTypeName(item),
          value: '',
        };
      }),
    );
    updateNodeInternals(id);
  };

  const handleModuleSelect = (name: string) => {
    if (packageData) {
      setSelectedModule(() => name);
      const list = Object.keys(packageData[name].exposedFunctions).filter(
        (item) => packageData[name].exposedFunctions[item].isEntry,
      );
      resetEdge();
      setFunctions(() => list);
      if (list.length > 0) {
        setArgumentHandles(
          list[0],
          packageData[name].exposedFunctions[list[0]],
        );
      } else {
        setArgumentHandles('', undefined);
      }
    }
  };

  const handleFunctionSelect = (name: string) => {
    if (packageData) {
      resetEdge();
      setArgumentHandles(
        name,
        packageData[selectedModule].exposedFunctions[name],
      );
    }
  };

  const code = useCallback(
    (params: CodeParam[]): string => {
      if (selectedFunction && selectedFunctionArgs) {
        const args: (CodeParam | undefined)[] = Array(
          selectedFunctionArgs.length,
        ).fill(undefined);
        params.forEach((item) => {
          const index = parseInt(
            item.targetHandle.split(':')[0].replace(PREFIX, ''),
          );
          args[index] = item;
        });
        const target = `'${packageId}::${selectedModule}:${selectedFunction}'`;
        const argumentsList = args
          .map((item) => (item?.name ? item.name : 'undefined'))
          .join(',\n\t\t');
        return `tx.moveCall({\n\ttarget:\n\t\t${target},\n\targuments: [\n\t\t${argumentsList},\n\t],\n})`;
      }
      return `tx.moveCall({\n\ttarget: undefined,\n\targuments: undefined\n});`;
    },
    [packageId, selectedFunction, selectedFunctionArgs, selectedModule],
  );

  const excute = useCallback(
    (
      transaction: Transaction,
      params: { source: Node; target: string }[],
      results: { id: string; value: any }[],
    ): { transaction: Transaction; result: any } | undefined => {
      // const params = args.map((item) => (item ? item.name : undefined));
      /*
      const result = transaction.moveCall({
        package: packageId,
        module: selectedModule,
        function: selectedFunction,
        // arguments: [...params],
      });
      return { transaction, result };
      */
      enqueueToast(`not support - MoveCall`, {
        variant: 'warning',
      });
      return undefined;
    },
    [],
  );

  useEffect(() => {
    if (data) {
      data.code = code;
      data.excute = excute;
    }
  }, [code, data, excute]);

  useEffect(() => {
    setNodes((nds) =>
      nds.map((node) => {
        if (node.id === id) {
          return {
            ...node,
            data: {
              ...node.data,
              value: {
                target: `${packageId}::${selectedModule}:${selectedFunction}`,
              },
            },
          };
        }
        return node;
      }),
    );
  }, [id, selectedFunction, packageId, selectedModule, setNodes]);

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
                handleModuleSelect(evt.target.value);
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
                handleFunctionSelect(evt.target.value);
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
          {selectedFunctionArgs.length > 0 && (
            <>
              <div className="border-t border-gray-300 dark:border-stone-700 mt-2 mb-1" />
              <div>
                {selectedFunctionArgs.map((item, index) => {
                  const top = `${200 + index * 42}px`;
                  return (
                    <div key={index} className={FormStyle}>
                      <label
                        className={LabelStyle}
                        style={{ fontSize: '0.6rem' }}
                      >{`Arg ${index}`}</label>
                      <input
                        type="text"
                        readOnly
                        placeholder={item.placeHolder}
                        autoComplete="off"
                        className={InputStyle}
                        value={item.value}
                      />
                      {item.type === 'address' ||
                      item.type === 'bool' ||
                      item.type === 'object' ||
                      item.type === 'number' ? (
                        <PtbHandle
                          typeHandle="target"
                          typeParams={item.type}
                          node="transactions"
                          name={`${PREFIX}${index}`}
                          style={{ top }}
                        />
                      ) : item.type === 'vector<u8>' ||
                        item.type === 'vector<u16>' ||
                        item.type === 'vector<u32>' ||
                        item.type === 'vector<u64>' ||
                        item.type === 'vector<u128>' ||
                        item.type === 'vector<u256>' ? (
                        <PtbHandleVector
                          typeHandle="target"
                          typeParams={item.type}
                          node="transactions"
                          name={`${PREFIX}${index}`}
                          style={{ top }}
                        />
                      ) : (
                        <></>
                      )}
                    </div>
                  );
                })}
              </div>
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
