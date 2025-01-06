import { SuiCallArg } from '@mysten/sui/client';

import { PTB } from '../../../components';
import { PTBNode } from '../../../ptbFlow/nodes';

export const getInputNode = (
  id: string,
  input: SuiCallArg,
): PTBNode | undefined => {
  if (input.type === 'pure') {
    switch (input.valueType) {
      case 'address':
        return {
          id,
          position: { x: 0, y: 0 },
          type: PTB.Address.Type,
          deletable: false,
          data: {
            label: PTB.Address.Name,
            value: input.value as string,
          },
        };
      case 'bool':
        return {
          id,
          position: { x: 0, y: 0 },
          type: PTB.Bool.Type,
          deletable: false,
          data: {
            label: PTB.Bool.Name,
            value: `${input.value}`,
          },
        };
      case 'u8':
      case 'u16':
      case 'u32':
      case 'u64':
      case 'u128':
      case 'u256':
        return {
          id,
          position: { x: 0, y: 0 },
          type: PTB.Number.Type,
          deletable: false,
          data: {
            label: PTB.Number.Name,
            value: input.value as string,
          },
        };
      case 'string':
        return {
          id,
          position: { x: 0, y: 0 },
          type: PTB.String.Type,
          deletable: false,
          data: {
            label: PTB.String.Name,
            value: input.value as string,
          },
        };
      case 'vector<u8>':
        return {
          id,
          position: { x: 0, y: 0 },
          type: PTB.NumberVectorU8.Type,
          deletable: false,
          data: {
            label: PTB.NumberVectorU8.Name,
            value: input.value as number[],
          },
        };
      case 'vector<u16>':
        return {
          id,
          position: { x: 0, y: 0 },
          type: PTB.NumberVectorU16.Type,
          deletable: false,
          data: {
            label: PTB.NumberVectorU16.Name,
            value: input.value as number[],
          },
        };
      case 'vector<u32>':
        return {
          id,
          position: { x: 0, y: 0 },
          type: PTB.NumberVectorU32.Type,
          deletable: false,
          data: {
            label: PTB.NumberVectorU32.Name,
            value: input.value as number[],
          },
        };
      case 'vector<u64>':
        return {
          id,
          position: { x: 0, y: 0 },
          type: PTB.NumberVectorU64.Type,
          deletable: false,
          data: {
            label: PTB.NumberVectorU64.Name,
            value: input.value as number[],
          },
        };
      case 'vector<u128>':
        return {
          id,
          position: { x: 0, y: 0 },
          type: PTB.NumberVectorU128.Type,
          deletable: false,
          data: {
            label: PTB.NumberVectorU128.Name,
            value: input.value as number[],
          },
        };
      case 'vector<u256>':
        return {
          id,
          position: { x: 0, y: 0 },
          type: PTB.NumberVectorU256.Type,
          deletable: false,
          data: {
            label: PTB.NumberVectorU256.Name,
            value: input.value as number[],
          },
        };
      case 'vector<address>':
        return {
          id,
          position: { x: 0, y: 0 },
          type: PTB.AddressVector.Type,
          deletable: false,
          data: {
            label: PTB.AddressVector.Name,
            value: input.value as string[],
          },
        };
      case 'vector<bool>':
        return {
          id,
          position: { x: 0, y: 0 },
          type: PTB.BoolVector.Type,
          deletable: false,
          data: {
            label: PTB.BoolVector.Name,
            value: input.value as string[],
          },
        };
      case 'vector<string>':
        return {
          id,
          position: { x: 0, y: 0 },
          type: PTB.StringVector.Type,
          deletable: false,
          data: {
            label: PTB.StringVector.Name,
            value: input.value as string[],
          },
        };
      case '0x2::object::ID':
        return {
          id,
          position: { x: 0, y: 0 },
          type: PTB.Object.Type,
          deletable: false,
          data: {
            label: PTB.Object.Name,
            value: input.value as string,
          },
        };
      default:
        if (Array.isArray(input.value)) {
          if (typeof input.value[0] === 'number') {
            if (input.value.length === 1) {
              return {
                id,
                position: { x: 0, y: 0 },
                type: PTB.Number.Type,
                deletable: false,
                data: {
                  label: PTB.Number.Name,
                  value: input.value[0] as number,
                },
              };
            } else {
              return {
                id,
                position: { x: 0, y: 0 },
                type: PTB.NumberArray.Type,
                deletable: false,
                data: {
                  label: PTB.NumberVectorU8.Name, // TODO: support vector
                  value: input.value as number[],
                },
              };
            }
          }
        }
        return undefined;
    }
  } else {
    return {
      id,
      position: { x: 0, y: 0 },
      type: PTB.Object.Type,
      deletable: false,
      data: {
        label: PTB.Object.Name,
        value: input.objectId,
      },
    };
  }
};
