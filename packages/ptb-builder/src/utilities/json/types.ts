import { Edge } from '@xyflow/react';

import { PTBNode } from '../../PTBFlow/nodes';

export const VERSION = '1';
export interface DEFAULT {
  version?: string;
  network: string;
  nodes: PTBNode[];
  edges: Edge[];
}
