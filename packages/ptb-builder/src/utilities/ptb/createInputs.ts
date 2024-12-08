import { SuiCallArg } from '@mysten/sui/client';
import { Edge, Node } from '@xyflow/react';

export const createInputs = (
  index: number,
  input: SuiCallArg,
): { nodes: Node[]; edges: Edge[] } => {
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
                value: input.value,
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
                value: input.value,
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
                value: input.value,
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
                value: input.value,
              },
            },
          ],
          edges: [],
        };
      case 'vector<u8>':
        return {
          nodes: [
            {
              id,
              position: { x: 0, y: 0 },
              type: 'SuiNumberVector',
              data: {
                value: input.value,
              },
            },
          ],
          edges: [],
        };
      case 'vector<u16>':
        return {
          nodes: [
            {
              id,
              position: { x: 0, y: 0 },
              type: 'SuiNumberVector',
              data: {
                value: input.value,
              },
            },
          ],
          edges: [],
        };
      case 'vector<u32>':
        return {
          nodes: [
            {
              id,
              position: { x: 0, y: 0 },
              type: 'SuiNumberVector',
              data: {
                value: input.value,
              },
            },
          ],
          edges: [],
        };
      case 'vector<u64>':
        return {
          nodes: [
            {
              id,
              position: { x: 0, y: 0 },
              type: 'SuiNumberVector',
              data: {
                value: input.value,
              },
            },
          ],
          edges: [],
        };
      case 'vector<u128>':
        return {
          nodes: [
            {
              id,
              position: { x: 0, y: 0 },
              type: 'SuiNumberVector',
              data: {
                value: input.value,
              },
            },
          ],
          edges: [],
        };
      case 'vector<u256>':
        return {
          nodes: [
            {
              id,
              position: { x: 0, y: 0 },
              type: 'SuiNumberVector',
              data: {
                value: input.value,
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
