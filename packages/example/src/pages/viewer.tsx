import { useEffect, useRef } from 'react';

import { useSuiClientContext } from '@mysten/dapp-kit';
import { usePTB } from '@zktx.io/ptb-builder';
import queryString from 'query-string';
import { useHotkeys } from 'react-hotkeys-hook';
import { useLocation } from 'react-router-dom';

import { ConnectScreen } from '../components/ConnectScreen';
import { usePtbUndo } from '../components/usePtbUndo';
import { SuiChain, SuiNetwork } from '../network';

export const Viewer = () => {
  // eslint-disable-next-line no-restricted-syntax
  const lastLoaded = useRef<string | null>(null);
  const { loadFromOnChainTx, loadFromDoc } = usePTB();

  const location = useLocation();
  const { network, selectNetwork } = useSuiClientContext();
  const { reset, undo, redo } = usePtbUndo();

  useEffect(() => {
    const parsed = queryString.parse(location.search);
    const rawTx = parsed.tx;
    if (!rawTx) {
      return;
    }

    const tx = Array.isArray(rawTx) ? rawTx[0] : rawTx;
    if (!tx) {
      return;
    }

    const match = tx.match(/^(?:sui:)?(mainnet|testnet|devnet):(.*)$/);
    const targetNetwork = match?.[1] as SuiNetwork | undefined;
    const txHash = (match?.[2] ?? tx).trim();

    if (!txHash) {
      return;
    }

    const effectiveNetwork = targetNetwork ?? network;
    const loadKey = `${effectiveNetwork}:${txHash}`;
    if (lastLoaded.current === loadKey) {
      return;
    }

    if (targetNetwork && targetNetwork !== network) {
      selectNetwork(targetNetwork);
    }

    loadFromOnChainTx(`sui:${effectiveNetwork}` as SuiChain, txHash);
    reset();
    lastLoaded.current = loadKey;
  }, [loadFromOnChainTx, location.search, network, reset, selectNetwork]);

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
