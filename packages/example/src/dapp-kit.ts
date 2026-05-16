import { createDAppKit } from '@mysten/dapp-kit-react';
import {
  createPtbCoreClientForNetwork,
  supportedNetworksForTransport,
} from '@zktx.io/ptb-builder';
import type { PtbCoreClientTransport } from '@zktx.io/ptb-builder';

import { loadNetwork, type NetworkType } from './network';

const SUI_TRANSPORT: PtbCoreClientTransport =
  import.meta.env.VITE_SUI_TRANSPORT === 'graphql' ? 'graphql' : 'grpc';
const supportedNetworks = supportedNetworksForTransport(
  SUI_TRANSPORT,
) as NetworkType[];

if (!supportedNetworks.length) {
  throw new Error(`No supported Sui networks for ${SUI_TRANSPORT} transport.`);
}

export const DAPP_NETWORKS = supportedNetworks as [
  NetworkType,
  ...NetworkType[],
];

const savedNetwork = loadNetwork();
const defaultNetwork = DAPP_NETWORKS.includes(savedNetwork)
  ? savedNetwork
  : DAPP_NETWORKS[0];

export const dAppKit = createDAppKit({
  enableBurnerWallet: import.meta.env.DEV,
  networks: DAPP_NETWORKS,
  defaultNetwork,
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
