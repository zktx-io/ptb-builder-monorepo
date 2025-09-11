import { useCurrentAccount, useSuiClientContext } from '@mysten/dapp-kit';
import { PTBDoc, usePTB } from '@zktx.io/ptb-builder';

import { DragAndDrop } from '../components/DragAndDrop';
import { SuiChain, SuiNetwork } from '../network';

export const Editor = () => {
  const { network, selectNetwork } = useSuiClientContext();
  const account = useCurrentAccount();
  const { loadFromDoc } = usePTB();

  // Safe parser for "sui:<network>"
  const parseNetwork = (chain?: string): SuiNetwork | undefined => {
    const m = chain?.match(/^sui:(mainnet|testnet|devnet)$/);
    return m?.[1] as SuiNetwork | undefined;
  };

  const handleDrop = (file: PTBDoc) => {
    // Only switch if the dropped file has a valid chain
    const target = parseNetwork(file.chain);
    if (target && target !== network) {
      selectNetwork(target);
    }
    loadFromDoc(file);
  };

  const handleChancel = () => {
    loadFromDoc(`sui:${network}` as SuiChain);
  };

  return (
    <div style={{ width: '100vw', height: '100vh' }}>
      {account && <DragAndDrop onDrop={handleDrop} onChancel={handleChancel} />}
    </div>
  );
};
