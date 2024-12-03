import { Edge, Node } from '@xyflow/react';

export const VERSION = '1';
export interface DEFAULT {
  version?: string;
  network: string;
  nodes: Node[];
  edges: Edge[];
}
