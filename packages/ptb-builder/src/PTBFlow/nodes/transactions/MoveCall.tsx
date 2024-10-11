import React, { useCallback, useEffect, useState } from 'react';

import {
  SuiMoveNormalizedFunction,
  SuiMoveNormalizedModule,
} from '@mysten/sui/client';
import { useReactFlow, useUpdateNodeInternals } from '@xyflow/react';

import { type NodeProp } from '..';
import { useStateContext } from '../../../Provider';
import { getTypeName } from '../../../utils/getTypeName';
import { loadPackageData } from '../../../utils/loadPackageData';
import { parameterFilter } from '../../../utils/parameterFilter';
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

export const MoveCall = ({ id, data }: NodeProp) => {
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
      value?: string;
    }[]
  >((data as any).handles || []);
  const [inputValues, setInputValues] = useState<
    { value: string; placeHolder: string }[]
  >(
    (data as any).handles
      ? (data as any).handles.map((item: any) => ({ value: item.value || '' }))
      : [],
  );

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

  const loadPackage = async () => {
    if (client && !!packageId) {
      const temp = await loadPackageData(client, packageId);
      if (temp && Object.keys(temp)[0]) {
        const select = Object.keys(temp)[0];
        setPackageData(temp);
        const list = Object.keys(temp[select].exposedFunctions).filter(
          (item) => temp[select].exposedFunctions[item].isEntry,
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
    setInputValues(() => {
      return temp.length > 0
        ? temp.map((item) => ({ value: '', placeHolder: getTypeName(item) }))
        : [];
    });
    setSelectedFunctionArgs(() =>
      temp.map((item, index) => {
        if (item === 'Address') {
          return { id: `${PREFIX}${index}`, type: 'address' };
        }
        if (item === 'Bool') {
          return { id: `${PREFIX}${index}`, type: 'bool' };
        }
        if (typeof item === 'string' && numericTypes.has(item)) {
          return { id: `${PREFIX}${index}`, type: 'number' };
        }
        if (objectTypes.has(Object.keys(item)[0])) {
          return { id: `${PREFIX}${index}`, type: 'object' };
        }
        return { id: `${PREFIX}${index}`, type: undefined };
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

  useEffect(() => {
    if (data) {
      data.code = code;
    }
  }, [code, data]);

  useEffect(() => {
    //
  }, []);

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
          {inputValues.length > 0 && (
            <>
              <div className="border-t border-gray-300 dark:border-stone-700 mt-2 mb-1" />
              <div>
                {inputValues.map((item, key) => (
                  <div key={key} className={FormStyle}>
                    <label
                      className={LabelStyle}
                      style={{ fontSize: '0.6rem' }}
                    >{`Arg ${key}`}</label>
                    <input
                      type="text"
                      readOnly
                      placeholder={item.placeHolder}
                      autoComplete="off"
                      className={InputStyle}
                      value={item.value}
                    />
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {selectedFunctionArgs.length > 0 &&
        selectedFunctionArgs.map(({ type }, index) => {
          const top = `${202 + index * 42}px`;
          switch (type) {
            case 'address':
            case 'bool':
            case 'object':
            case 'number':
              return (
                <PtbHandle
                  key={`handle-${selectedFunction}-${index}`}
                  typeHandle="target"
                  typeParams={type}
                  node="transactions"
                  name={`${PREFIX}${index}`}
                  style={{ top }}
                />
              );
            case 'vector<u8>':
            case 'vector<u16>':
            case 'vector<u32>':
            case 'vector<u64>':
            case 'vector<u128>':
            case 'vector<u256>':
              return (
                <PtbHandleVector
                  key={`handle-${selectedFunction}-${index}`}
                  typeHandle="target"
                  typeParams={type}
                  node="transactions"
                  name={`${PREFIX}${index}`}
                  style={{ top }}
                />
              );
            default:
              break;
          }
          return <div key={index}></div>;
        })}

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
