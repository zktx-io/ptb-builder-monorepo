import type { Connection } from '@xyflow/react';

export const NumericTypes = new Set([
  'u8',
  'u16',
  'u32',
  'u64',
  'u128',
  'u256',
]);

export type TYPE_PARAMS =
  | 'address'
  | 'string'
  | 'number'
  | 'u8'
  | 'u16'
  | 'u32'
  | 'u64'
  | 'u128'
  | 'u256'
  | 'bool'
  | 'object';

export type TYPE_ARRAY =
  | 'address[]'
  | 'number[]'
  | 'u8[]'
  | 'u16[]'
  | 'u32[]'
  | 'u64[]'
  | 'u128[]'
  | 'u256[]'
  | 'bool[]'
  | 'object[]';

export type TYPE_VECTOR =
  | 'vector<address>'
  | 'vector<u8>'
  | 'vector<u16>'
  | 'vector<u32>'
  | 'vector<u64>'
  | 'vector<u128>'
  | 'vector<u256>'
  | 'vector<bool>'
  | 'vector<object>';

export type TYPE =
  | TYPE_PARAMS
  | TYPE_ARRAY
  | TYPE_VECTOR
  | 'moveCall'
  | 'process';

export const isTargetType = (connection: Connection, type: TYPE): boolean => {
  if (
    connection &&
    connection.targetHandle &&
    typeof connection.targetHandle === 'string'
  ) {
    const parsed = (connection.targetHandle as string).split(':');
    return !!parsed[1] && parsed[1] === type;
  }
  return false;
};

export const isSourceType = (connection: Connection, type: TYPE): boolean => {
  if (
    connection &&
    connection.sourceHandle &&
    typeof connection.sourceHandle === 'string'
  ) {
    const parsed = (connection.sourceHandle as string).split(':');
    return !!parsed[1] && parsed[1] === type;
  }
  return false;
};
