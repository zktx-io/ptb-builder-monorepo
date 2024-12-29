import { useEffect, useRef, useState } from 'react';

import { PTB_SCHEME, PTBBuilder } from '@zktx.io/ptb-builder';
import { enqueueSnackbar } from 'notistack';
import queryString from 'query-string';
import { useLocation } from 'react-router-dom';

import { NETWORK } from '../network';

export const Viewer = () => {
  const initialized = useRef<boolean>(false);

  const location = useLocation();
  const [txHash, setTxHash] = useState<string | undefined>(undefined);

  useEffect(() => {
    const parsed = queryString.parse(location.search);
    if (parsed.tx && !initialized.current) {
      setTxHash((parsed.tx as string) || '');
    } else {
      setTxHash('');
    }
  }, [location.search, txHash]);

  return (
    <div style={{ width: '100vw', height: '100vh' }}>
      <PTBBuilder
        network={NETWORK}
        restore={txHash}
        options={{
          canEdit: false,
          themeSwitch: true,
        }}
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        update={(_value: PTB_SCHEME) => {
          // console.log(_value);
        }}
        enqueueToast={(message, options) => enqueueSnackbar(message, options)}
      />
    </div>
  );
};
