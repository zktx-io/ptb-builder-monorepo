export const EMPTY_CODE = (net?: string) => {
  if (!net) {
    return `// PTB Code Preview
// No network is selected yet.
// - Load a document (loadFromDoc) or load a chain transaction (loadFromOnChainTx)
//   to set the active network.
// - Dry-run / Execute are disabled until a network is selected.
//
// Preview metadata only.
// Add a command node and wire its inputs/outputs to generate model-rendered TS SDK code here.
`;
  }

  return `// PTB Code Preview (network: ${net})
// No commands yet.
// Add a MoveCall, SplitCoins, or another command node and wire its inputs/outputs.
`;
};
