import { ProgrammableTransaction, SuiTransaction } from '@mysten/sui/client';
import { Edge, Node } from '@xyflow/react';

interface MoveCallHandle {
  id: string;
  type: 'object' | 'number' | 'string' | 'address' | 'bool' | undefined;
  value?: string;
}

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

export const moveCall = (
  index: number,
  ptb: ProgrammableTransaction,
  suiTx: SuiTransaction,
  id: string,
): {
  edges: Edge[];
  inputs: Node[];
  package: string;
  module: string;
  function: string;
  handles: MoveCallHandle[];
} => {
  const edges: Edge[] = [];
  const inputs: Node[] = [];
  const handles: MoveCallHandle[] = [];
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
              switch ((ptb.inputs[item.Input] as any).valueType) {
                case 'vector<u8>':
                case 'vector<u16>':
                case 'vector<u32>':
                case 'vector<u64>':
                case 'vector<u128>':
                case 'vector<u256>':
                  handles.push({
                    id: `${PREFIX}${i}`,
                    type: (ptb.inputs[item.Input] as any).valueType,
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
                  break;
                default:
                  handles.push({
                    id: `${PREFIX}${i}`,
                    type: undefined,
                  });
                  break;
              }
            } else if (
              (ptb.inputs[item.Input] as any).valueType === 'address'
            ) {
              handles.push({
                id: `${PREFIX}${i}`,
                type: 'address',
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
              });
            }
          }
        } else {
          // TODO
          handles.push({
            id: `${PREFIX}${i}`,
            type: undefined,
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
