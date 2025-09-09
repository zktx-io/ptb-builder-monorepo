import { useEffect } from 'react';

import { useCurrentAccount, useSuiClientContext } from '@mysten/dapp-kit';
import { PTB_VERSION, PTBDoc, usePTB } from '@zktx.io/ptb-builder';

import { DragAndDrop } from '../components/DragAndDrop';
import { NETWORK } from '../network';

export const Editor = () => {
  const ctx = useSuiClientContext();
  const account = useCurrentAccount();
  const { loadFromDoc } = usePTB();

  const handleDrop = (file: PTBDoc) => {
    ctx.selectNetwork((file.chain || NETWORK).split(':')[1]);
    loadFromDoc(file);
  };

  const handleChancel = () => {
    loadFromDoc({
      version: PTB_VERSION,
      chain: NETWORK,
      graph: { nodes: [], edges: [] },
    });
  };

  useEffect(() => {
    loadFromDoc({
      version: PTB_VERSION,
      chain: NETWORK,
      graph: { nodes: [], edges: [] },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div style={{ width: '100vw', height: '100vh' }}>
      {account && <DragAndDrop onDrop={handleDrop} onChancel={handleChancel} />}
    </div>
  );
};
