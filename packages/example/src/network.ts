export const NETWORKS = ['mainnet', 'testnet', 'devnet'] as const;
export type NetworkType = (typeof NETWORKS)[number];
export type SuiNetwork = 'mainnet' | 'testnet' | 'devnet';
export type SuiChain = `sui:${SuiNetwork}`;

const STORAGE_KEY = 'ptb:network';

export function loadNetwork(): SuiNetwork {
  return (localStorage.getItem(STORAGE_KEY) as SuiNetwork) ?? 'testnet';
}

export function saveNetwork(network: SuiNetwork) {
  localStorage.setItem(STORAGE_KEY, network);
}
