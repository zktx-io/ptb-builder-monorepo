import { useEffect, useRef, useState } from 'react';

import { usePTB } from '@zktx.io/ptb-builder';
import queryString from 'query-string';
import { useLocation } from 'react-router-dom';
import { useSuiClientContext } from '@mysten/dapp-kit';
import { SuiChain } from '../network';

export const Viewer = () => {
  const initialized = useRef<boolean>(false);
  const { loadFromOnChainTx } = usePTB();

  const location = useLocation();
  const { network } = useSuiClientContext();
  const [txHash, setTxHash] = useState<string | undefined>(undefined);

  useEffect(() => {
    const parsed = queryString.parse(location.search);
    if (parsed.tx && !initialized.current) {
      console.log('Loading from tx:', parsed.tx, 'on', network);
      loadFromOnChainTx(`sui:${network}` as SuiChain, parsed.tx as string);
      initialized.current = true;
    } else {
      setTxHash('');
    }
  }, [loadFromOnChainTx, location.search, network, txHash]);

  return <></>;
};
