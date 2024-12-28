import { SuiMoveNormalizedModules } from '@mysten/sui/dist/cjs/client';

import { PTBEdge, PTBNode } from '../ptbFlow/nodes';

export { DEBOUNCE, useDebounce } from './debounce';
export { getPath } from './getPath';
export { getPackageData, toPTBModuleData } from './getPackageData';
export { decodeTxb } from './ptb/decodeTxb';

export const PTB_SCHEME_VERSION = '2';
export interface PTB_SCHEME {
  version?: string;
  network?: 'mainnet' | 'testnet' | 'devnet';
  flow?: {
    nodes: PTBNode[];
    edges: PTBEdge[];
    viewport: {
      x: number;
      y: number;
      zoom: number;
    };
  };
  modules: Record<string, SuiMoveNormalizedModules>;
}
