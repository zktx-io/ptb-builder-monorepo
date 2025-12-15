import { useSuiClientContext } from '@mysten/dapp-kit';
import { PTBDoc, usePTB } from '@zktx.io/ptb-builder';
import { useHotkeys } from 'react-hotkeys-hook';

import { ConnectScreen } from '../components/ConnectScreen';
import { DragAndDrop } from '../components/DragAndDrop';
import { usePtbUndo } from '../components/usePtbUndo';
import { SuiChain, SuiNetwork } from '../network';

export const Editor = () => {
  const { network, selectNetwork } = useSuiClientContext();
  const { loadFromDoc } = usePTB();
  const { reset, undo, redo } = usePtbUndo();

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
    reset();
  };

  const handleChancel = () => {
    loadFromDoc(`sui:${network}` as SuiChain);
    reset();
  };

  useHotkeys(
    'meta+z,ctrl+z',
    () => {
      const doc = undo();
      if (doc) {
        loadFromDoc(doc);
      }
    },
    { enableOnFormTags: true, preventDefault: false },
    [undo],
  );

  useHotkeys(
    'meta+shift+z,ctrl+shift+z,ctrl+y',
    () => {
      const doc = redo();
      if (doc) {
        loadFromDoc(doc);
      }
    },
    { enableOnFormTags: true, preventDefault: false },
    [redo],
  );

  return (
    <ConnectScreen
      title="PTB Builder"
      subtitle="Connect your wallet to open the Editor"
      connected={
        <div style={{ width: '100vw', height: '100vh' }}>
          <DragAndDrop onDrop={handleDrop} onChancel={handleChancel} />
        </div>
      }
    />
  );
};
