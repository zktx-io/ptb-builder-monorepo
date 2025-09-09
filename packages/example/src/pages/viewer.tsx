import { useEffect, useRef, useState } from 'react';

import { usePTB } from '@zktx.io/ptb-builder';
import queryString from 'query-string';
import { useLocation } from 'react-router-dom';

export const Viewer = () => {
  const initialized = useRef<boolean>(false);
  const { loadFromOnChainTx } = usePTB();

  const location = useLocation();
  const [txHash, setTxHash] = useState<string | undefined>(undefined);

  useEffect(() => {
    const parsed = queryString.parse(location.search);
    if (parsed.tx && !initialized.current) {
      loadFromOnChainTx('sui:testnet', parsed.tx as string);
      initialized.current = true;
    } else {
      setTxHash('');
    }
  }, [loadFromOnChainTx, location.search, txHash]);

  return <></>;
};
