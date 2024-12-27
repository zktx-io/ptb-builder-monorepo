import { NETWORK } from '../provider';
import { PTBEdge, PTBNode } from '../ptbFlow/nodes';

export { useDebounce } from './debounce';
export { getPath } from './getPath';
export { getPackageData } from './getPackageData';
export { getTxbData } from './getTxbData';

export const PTB_SCHEME_VERSION = '2';
export interface PTB_SCHEME {
  version?: string;
  network?: NETWORK;
  flow?: {
    nodes: PTBNode[];
    edges: PTBEdge[];
    viewport: {
      x: number;
      y: number;
      zoom: number;
    };
  };
}
