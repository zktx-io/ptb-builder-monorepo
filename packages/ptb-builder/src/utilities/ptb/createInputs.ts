import { SuiCallArg } from '@mysten/sui/client';
import { Edge } from '@xyflow/react';

import { PTBNode } from '../../PTBFlow/nodes';

export const createInputs = (
  index: number,
  input: SuiCallArg,
): { nodes: PTBNode[]; edges: Edge[] } => {
  const id = `input-${index}`;
  if (input.type === 'pure') {
    switch (input.valueType) {
      case 'address':
        return {
          nodes: [
            {
              id,
              position: { x: 0, y: 0 },
              type: 'SuiAddress',
              data: {
                label: 'address',
                value: input.value as string,
              },
            },
          ],
          edges: [],
        };
      case 'bool':
        return {
          nodes: [
            {
              id,
              position: { x: 0, y: 0 },
              type: 'SuiBool',
              data: {
                label: 'bool',
                value: `${input.value}`,
              },
            },
          ],
          edges: [],
        };
      case 'u8':
      case 'u16':
      case 'u32':
      case 'u64':
      case 'u128':
      case 'u256':
        return {
          nodes: [
            {
              id,
              position: { x: 0, y: 0 },
              type: 'SuiNumber',
              data: {
                label: 'number',
                value: input.value as string,
              },
            },
          ],
          edges: [],
        };
      case 'bool':
        return {
          nodes: [
            {
              id,
              position: { x: 0, y: 0 },
              type: 'SuiBool',
              data: {
                label: 'bool',
                value: `${input.value}`,
              },
            },
          ],
          edges: [],
        };
      case 'string':
        return {
          nodes: [
            {
              id,
              position: { x: 0, y: 0 },
              type: 'SuiString',
              data: {
                label: 'string',
                value: input.value as string,
              },
            },
          ],
          edges: [],
        };
      case 'vector<u8>':
      case 'vector<u16>':
      case 'vector<u32>':
      case 'vector<u64>':
      case 'vector<u128>':
      case 'vector<u256>':
        return {
          nodes: [
            {
              id,
              position: { x: 0, y: 0 },
              type: 'SuiNumberVector',
              data: {
                label: input.valueType,
                value: input.value as string[],
              },
            },
          ],
          edges: [],
        };
      default:
        break;
    }
  } else {
    return {
      nodes: [
        {
          id,
          position: { x: 0, y: 0 },
          type: 'SuiObject',
          data: {
            label: 'SuiObject',
            value: input.objectId,
          },
        },
      ],
      edges: [],
    };
  }
  return { nodes: [], edges: [] };
};
