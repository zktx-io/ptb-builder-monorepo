import { useEffect, useMemo, useRef, useState } from 'react';

import { useCurrentNetwork, useDAppKit } from '@mysten/dapp-kit-react';
import { usePTB } from '@zktx.io/ptb-builder';
import queryString from 'query-string';
import { useHotkeys } from 'react-hotkeys-hook';
import { useLocation } from 'react-router-dom';

import { TransactionPrompt } from '../components/TransactionPrompt';
import { usePtbUndo } from '../components/usePtbUndo';
import { DAPP_NETWORKS } from '../dapp-kit';
import { saveNetwork, SuiChain, SuiNetwork } from '../network';

const TX_QUERY_REGEX = /^(?:sui:)?(mainnet|testnet|devnet):(.*)$/;

const parseTxInput = (
  input?: string | null,
): { network?: SuiNetwork; txHash: string } | undefined => {
  if (!input) {
    return undefined;
  }
  const value = input.trim();
  if (!value) {
    return undefined;
  }
  const match = value.match(TX_QUERY_REGEX);
  const txHash = (match?.[2] ?? value).trim();
  if (!txHash) {
    return undefined;
  }
  return {
    network: match ? (match[1] as SuiNetwork) : undefined,
    txHash,
  };
};

const normalizeDigest = (input?: string) => {
  const trimmed = input?.trim();
  if (!trimmed || trimmed.includes(':')) {
    return undefined;
  }
  return trimmed;
};

export const Viewer = () => {
  const lastLoaded = useRef<string | undefined>(undefined);
  const { loadFromOnChainTx, loadFromDoc } = usePTB();

  const location = useLocation();
  const dAppKit = useDAppKit();
  const network = useCurrentNetwork() as SuiNetwork;
  const { reset, undo, redo } = usePtbUndo();

  const parsedQuery = useMemo(() => {
    const parsed = queryString.parse(location.search);
    const rawTx = parsed.tx;
    const tx =
      Array.isArray(rawTx) && rawTx.length
        ? rawTx[0]
        : (rawTx as string | undefined);

    return parseTxInput(tx);
  }, [location.search]);
  const [showPrompt, setShowPrompt] = useState(() => !parsedQuery);
  const [manualTx, setManualTx] = useState('');

  useEffect(() => {
    if (!parsedQuery) {
      return;
    }
    const { network: targetNetwork, txHash } = parsedQuery;
    const effectiveNetwork = targetNetwork ?? network;
    if (!DAPP_NETWORKS.includes(effectiveNetwork)) {
      setShowPrompt(true);
      return;
    }
    const loadKey = `${effectiveNetwork}:${txHash}`;
    if (lastLoaded.current === loadKey) {
      return;
    }

    if (targetNetwork && targetNetwork !== network) {
      dAppKit.switchNetwork(targetNetwork);
    }

    let cancelled = false;
    void (async () => {
      const result = await loadFromOnChainTx(
        `sui:${effectiveNetwork}` as SuiChain,
        txHash,
      );
      if (cancelled) return;
      if (result.ok) {
        reset();
        lastLoaded.current = loadKey;
      } else {
        setShowPrompt(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [dAppKit, loadFromOnChainTx, parsedQuery, network, reset]);

  const lastSearch = useRef(location.search);
  useEffect(() => {
    if (location.search === lastSearch.current) {
      return;
    }
    setShowPrompt(!parsedQuery);
    lastSearch.current = location.search;
  }, [location.search, parsedQuery]);

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

  const handleManualLoad = async () => {
    const txHash = normalizeDigest(manualTx);
    if (!txHash) {
      return;
    }
    const effectiveNetwork = network;
    if (!DAPP_NETWORKS.includes(effectiveNetwork)) {
      return;
    }
    const loadKey = `${effectiveNetwork}:${txHash}`;
    if (lastLoaded.current === loadKey) {
      setShowPrompt(false);
      return;
    }

    const result = await loadFromOnChainTx(
      `sui:${effectiveNetwork}` as SuiChain,
      txHash,
    );
    if (!result.ok) {
      setShowPrompt(true);
      return;
    }
    reset();
    lastLoaded.current = loadKey;
    setShowPrompt(false);
  };

  const canLoadDigest = manualTx.trim() !== '';

  return showPrompt ? (
    <TransactionPrompt
      network={network}
      txValue={manualTx}
      onNetworkChange={(value) => {
        dAppKit.switchNetwork(value);
        saveNetwork(value);
      }}
      onTxChange={setManualTx}
      onLoad={handleManualLoad}
      canLoad={canLoadDigest}
    />
  ) : undefined;
};
