export const NETWORKS = ['mainnet', 'testnet', 'devnet'] as const;
export type NetworkType = (typeof NETWORKS)[number];
