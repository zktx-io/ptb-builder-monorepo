import { ProgrammableTransaction, SuiTransaction } from '@mysten/sui/client';

import { FuncArg } from '../../../components';
import { enqueueToast } from '../../../provider';
import { PTBEdge, PTBNode } from '../../../_PTBFlow/nodes';

const PREFIX = 'param-';
const numericTypes = new Set(['u8', 'u16', 'u32', 'u64', 'u128', 'u256']);
const numericVectorTypes = new Set([
  'vector<u8>',
  'vector<u16>',
  'vector<u32>',
  'vector<u64>',
  'vector<u128>',
  'vector<u256>',
]);

const getConnectType = (
  ptb: ProgrammableTransaction,
  id: number,
): { sourceHandle: string; type: string } | undefined => {
  const tx = ptb.transactions[id];
  if (
    'MakeMoveVec' in tx &&
    typeof tx.MakeMoveVec[1][0] === 'object' &&
    'NestedResult' in tx.MakeMoveVec[1][0]
  ) {
    const tx2 = ptb.transactions[tx.MakeMoveVec[1][0].NestedResult[0]];
    if (typeof tx2 === 'object' && 'SplitCoins' in tx2) {
      return {
        sourceHandle: 'result:vector<object>',
        type: 'vector<object>',
      };
    }
  } else if ('SplitCoins' in tx) {
    return {
      sourceHandle: 'result:object[]',
      type: 'object[]',
    };
  }
  return undefined;
};

export const moveCall = (
  index: number,
  ptb: ProgrammableTransaction,
  suiTx: SuiTransaction,
  id: string,
): {
  edges: PTBEdge[];
  inputs: PTBNode[];
  package: string;
  module: string;
  function: string;
  handles: FuncArg[];
} => {
  const edges: PTBEdge[] = [];
  const inputs: PTBNode[] = [];
  const handles: FuncArg[] = [];
  let _package: string = '';
  let _module: string = '';
  let _function: string = '';

  if ('MoveCall' in suiTx) {
    _package = suiTx.MoveCall.package;
    _module = suiTx.MoveCall.module;
    _function = suiTx.MoveCall.function;

    const { arguments: args } = suiTx.MoveCall;

    args &&
      args.forEach((item, i) => {
        if (typeof item !== 'string' && 'Input' in item) {
          const { type } = ptb.inputs[item.Input];
          if (type === 'object') {
            handles.push({
              id: `${PREFIX}${i}`,
              type: 'object',
              placeHolder: (ptb.inputs[item.Input] as any).objectId,
              value: (ptb.inputs[item.Input] as any).objectId,
            });
            edges.push({
              id: `sub-${index}-${i}`,
              type: 'Data',
              source: `input-${item.Input}`,
              sourceHandle: 'inputs:object',
              target: id,
              targetHandle: `${PREFIX}${i}:object`,
            });
          } else {
            if (numericTypes.has((ptb.inputs[item.Input] as any).valueType)) {
              handles.push({
                id: `${PREFIX}${i}`,
                type: 'number',
                placeHolder: (ptb.inputs[item.Input] as any).value,
                value: (ptb.inputs[item.Input] as any).value,
              });
              edges.push({
                id: `sub-${index}-${i}`,
                type: 'Data',
                source: `input-${item.Input}`,
                sourceHandle: 'inputs:number',
                target: id,
                targetHandle: `${PREFIX}${i}:number`,
              });
            } else if (
              numericVectorTypes.has((ptb.inputs[item.Input] as any).valueType)
            ) {
              handles.push({
                id: `${PREFIX}${i}`,
                type: (ptb.inputs[item.Input] as any).valueType,
                placeHolder: (ptb.inputs[item.Input] as any).valueType,
                value: (ptb.inputs[item.Input] as any).valueType,
              });
              edges.push({
                id: `sub-${index}-${i}`,
                type: 'Data',
                source: `input-${item.Input}`,
                sourceHandle: `inputs:${(ptb.inputs[item.Input] as any).valueType}`,
                target: id,
                targetHandle: `${PREFIX}${i}:${(ptb.inputs[item.Input] as any).valueType}`,
              });
            } else if (
              (ptb.inputs[item.Input] as any).valueType === 'address'
            ) {
              handles.push({
                id: `${PREFIX}${i}`,
                type: 'address',
                placeHolder: (ptb.inputs[item.Input] as any).value,
                value: (ptb.inputs[item.Input] as any).value,
              });
              edges.push({
                id: `sub-${index}-${i}`,
                type: 'Data',
                source: `input-${item.Input}`,
                sourceHandle: 'inputs:address',
                target: id,
                targetHandle: `${PREFIX}${i}:address`,
              });
            } else if ((ptb.inputs[item.Input] as any).valueType === 'bool') {
              handles.push({
                id: `${PREFIX}${i}`,
                type: 'bool',
                placeHolder: `${(ptb.inputs[item.Input] as any).value}`,
                value: `${(ptb.inputs[item.Input] as any).value}`,
              });
              edges.push({
                id: `sub-${index}-${i}`,
                type: 'Data',
                source: `input-${item.Input}`,
                sourceHandle: 'inputs:bool',
                target: id,
                targetHandle: `${PREFIX}${i}:bool`,
              });
            } else {
              // TODO
              handles.push({
                id: `${PREFIX}${i}`,
                type: undefined,
                placeHolder: 'undefined',
                value: '',
              });
              enqueueToast(`not support (1) - ${JSON.stringify(item)}`, {
                variant: 'warning',
              });
            }
          }
        } else if (typeof item !== 'string' && 'Result' in item) {
          const connectType = getConnectType(ptb, item.Result);
          handles.push({
            id: `${PREFIX}${i}`,
            type: connectType ? (connectType.type as any) : undefined,
            placeHolder: `Result: ${item.Result}`,
            value: connectType ? connectType.type : '',
          });
          connectType &&
            edges.push({
              id: `sub-${index}-${i}`,
              type: 'Data',
              source: `tx-${item.Result}`,
              sourceHandle: connectType.sourceHandle,
              target: id,
              targetHandle: `${PREFIX}${i}:${connectType.type}`,
            });
          !connectType &&
            enqueueToast(`not support (2) - ${JSON.stringify(item)}`, {
              variant: 'warning',
            });
        } else if (typeof item !== 'string' && 'NestedResult' in item) {
          handles.push({
            id: `${PREFIX}${i}`,
            type: undefined,
            placeHolder: 'NestedResult',
            value: '',
          });
          // TODO
        } else if (item === 'GasCoin') {
          handles.push({
            id: `${PREFIX}${i}`,
            type: 'object',
            placeHolder: item,
            value: item,
          });
          edges.push({
            id: `sub-${index}-${i}`,
            type: 'Data',
            source: '@gasCoin',
            sourceHandle: 'inputs:object',
            target: id,
            targetHandle: `${PREFIX}${i}:object`,
          });
        } else {
          // TODO
          handles.push({
            id: `${PREFIX}${i}`,
            type: undefined,
            placeHolder: 'undefined',
            value: '',
          });
          enqueueToast(`not support (3) - ${JSON.stringify(item)}`, {
            variant: 'warning',
          });
        }
      });
  }

  return {
    edges,
    inputs,
    handles,
    package: _package,
    module: _module,
    function: _function,
  };
};
