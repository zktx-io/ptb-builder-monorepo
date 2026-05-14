import { createDAppKit } from '@mysten/dapp-kit-react';
import {
  createPtbCoreClientForNetwork,
  type PtbCoreClientTransport,
} from '@zktx.io/ptb-builder';

import { loadNetwork, NETWORKS, type NetworkType } from './network';

const DAPP_NETWORKS = [...NETWORKS] as [NetworkType, NetworkType, NetworkType];
const SUI_TRANSPORT: PtbCoreClientTransport =
  import.meta.env.VITE_SUI_TRANSPORT === 'graphql' ? 'graphql' : 'grpc';

export const dAppKit = createDAppKit({
  enableBurnerWallet: import.meta.env.DEV,
  networks: DAPP_NETWORKS,
  defaultNetwork: loadNetwork(),
  createClient(network: NetworkType) {
    return createPtbCoreClientForNetwork(network, {
      transport: SUI_TRANSPORT,
    });
  },
});

declare module '@mysten/dapp-kit-react' {
  interface Register {
    dAppKit: typeof dAppKit;
  }
}
