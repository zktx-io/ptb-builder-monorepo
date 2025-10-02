import { useEffect, useRef, useState } from 'react';

import { useSuiClientContext } from '@mysten/dapp-kit';
import { usePTB } from '@zktx.io/ptb-builder';
import queryString from 'query-string';
import { useHotkeys } from 'react-hotkeys-hook';
import { useLocation } from 'react-router-dom';

import { usePtbUndo } from '../components/usePtbUndo';
import { SuiChain } from '../network';
import { ConnectScreen } from '../components/ConnectScreen';

export const Viewer = () => {
  const initialized = useRef<boolean>(false);
  const { loadFromOnChainTx, loadFromDoc } = usePTB();

  const location = useLocation();
  const { network } = useSuiClientContext();
  const [txHash, setTxHash] = useState<string | undefined>(undefined);
  const { reset, undo, redo } = usePtbUndo();

  useEffect(() => {
    const parsed = queryString.parse(location.search);
    if (parsed.tx && !initialized.current) {
      loadFromOnChainTx(`sui:${network}` as SuiChain, parsed.tx as string);
      reset();
      initialized.current = true;
    } else {
      setTxHash('');
    }
  }, [loadFromOnChainTx, location.search, network, reset, txHash]);

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
      subtitle="Connect your wallet to view on-chain PTBs"
      connected={<></>}
    />
  );
};
