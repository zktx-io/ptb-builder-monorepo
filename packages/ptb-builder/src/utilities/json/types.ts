import { PTBEdge, PTBNode } from '../../ptbFlow/nodes';

export const VERSION = '1';
export interface DEFAULT {
  version?: string;
  network: string;
  nodes: PTBNode[];
  edges: PTBEdge[];
}
