import { SuiCallArg } from '@mysten/sui/client';

import { PTB } from '../../components';
import { enqueueToast } from '../../provider';
import { PTBEdge, PTBNode, PTBNodeType } from '../../PTBFlow/nodes';

export const createInputs = (
  index: number,
  input: SuiCallArg,
): { nodes: PTBNode[]; edges: PTBEdge[] } => {
  const id = `input-${index}`;
  if (input.type === 'pure') {
    switch (input.valueType) {
      case 'address':
        return {
          nodes: [
            {
              id,
              position: { x: 0, y: 0 },
              type: PTB.Address.Type,
              data: {
                label: PTB.Address.Name,
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
              type: PTB.Bool.Type,
              data: {
                label: PTB.Bool.Name,
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
              type: PTB.Number.Type,
              data: {
                label: PTB.Number.Name,
                value: input.value as string,
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
              type: PTB.String.Type,
              data: {
                label: PTB.String.Name,
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
              type: PTBNodeType.NumberVector,
              data: {
                label: input.valueType,
                value: input.value as string[],
              },
            },
          ],
          edges: [],
        };
      default:
        enqueueToast(`not support valueType: ${input.valueType}`, {
          variant: 'warning',
        });
        break;
    }
  } else {
    return {
      nodes: [
        {
          id,
          position: { x: 0, y: 0 },
          type: PTB.Object.Type,
          data: {
            label: PTB.Object.Name,
            value: input.objectId,
          },
        },
      ],
      edges: [],
    };
  }
  return { nodes: [], edges: [] };
};
