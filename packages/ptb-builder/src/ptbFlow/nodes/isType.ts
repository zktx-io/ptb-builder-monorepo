import type { Connection } from '@xyflow/react';

import { TYPE } from './types';

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

export const extractName = (name: string, sourceHandle: string): string => {
  const match = sourceHandle.match(/^[a-zA-Z]+-(\d+):[^:]+$/);
  return match ? `${name}[${parseInt(match[1], 10)}]` : name;
};

export const extractIndex = (sourceHandle: string): number | undefined => {
  const match = sourceHandle.match(/^[a-zA-Z]+-(\d+):[^:]+$/);
  return match ? parseInt(match[1], 10) : undefined;
};
