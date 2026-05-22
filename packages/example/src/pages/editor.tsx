import { useCurrentNetwork, useDAppKit } from '@mysten/dapp-kit-react';
import { usePTB } from '@zktx.io/ptb-builder';
import type { PTBDoc } from '@zktx.io/ptb-builder';
import { useHotkeys } from 'react-hotkeys-hook';

import { ConnectScreen } from '../components/ConnectScreen';
import { DragAndDrop } from '../components/DragAndDrop';
import { DAPP_NETWORKS } from '../dapp-kit';
import { SuiChain, SuiNetwork } from '../network';

export const Editor = () => {
  const dAppKit = useDAppKit();
  const network = useCurrentNetwork() as SuiNetwork;
  const { loadFromDoc, undo, redo } = usePTB();

  // Safe parser for "sui:<network>"
  const parseNetwork = (chain?: string): SuiNetwork | undefined => {
    const m = chain?.match(/^sui:(mainnet|testnet|devnet)$/);
    return m?.[1] as SuiNetwork | undefined;
  };

  const handleDrop = (file: PTBDoc) => {
    // Only switch if the dropped file has a valid chain
    const target = parseNetwork(file.chain);
    if (target && !DAPP_NETWORKS.includes(target)) {
      return {
        ok: false as const,
        message: `Unsupported network for the current transport: ${target}`,
      };
    }
    if (target && target !== network) {
      dAppKit.switchNetwork(target);
    }
    const result = loadFromDoc(file);
    if (!result.ok) {
      return { ok: false as const, message: result.error };
    }
  };

  const handleChancel = () => {
    loadFromDoc(`sui:${network}` as SuiChain);
  };

  useHotkeys(
    'meta+z,ctrl+z',
    () => {
      undo();
    },
    { enableOnFormTags: true, preventDefault: true },
    [undo],
  );

  useHotkeys(
    'meta+shift+z,ctrl+shift+z,ctrl+y',
    () => {
      redo();
    },
    { enableOnFormTags: true, preventDefault: true },
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
