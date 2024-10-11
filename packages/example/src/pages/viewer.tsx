import { useEffect, useRef, useState } from 'react';

import {
  getFullnodeUrl,
  SuiClient,
  TransactionBlockData,
} from '@mysten/sui/client';
import { PTBBuilder } from '@zktx.io/ptb-builder';
import { enqueueSnackbar } from 'notistack';
import queryString from 'query-string';
import { useLocation } from 'react-router-dom';

export const Viewer = () => {
  const initialized = useRef<boolean>(false);

  const network = 'testnet';
  const location = useLocation();
  const [txData, setTxData] = useState<TransactionBlockData | undefined>(
    undefined,
  );

  useEffect(() => {
    const lodaData = async (txHash: string) => {
      initialized.current = true;
      try {
        const client = new SuiClient({
          url: getFullnodeUrl(network),
        });
        const res = await client.getTransactionBlock({
          digest: txHash!,
          options: {
            showInput: true,
            showObjectChanges: true,
          },
        });
        // console.log(res);
        if (!res.errors && res.transaction) {
          setTxData(res.transaction.data);
        } else {
          enqueueSnackbar(`${res.errors?.toString()}`, {
            variant: 'error',
          });
        }
      } catch (error) {
        enqueueSnackbar(`${error}`, {
          variant: 'error',
        });
      }
    };
    const parsed = queryString.parse(location.search);
    if (parsed.tx && !initialized.current) {
      lodaData(parsed.tx as string);
    }
  }, [location.search]);

  return (
    <div style={{ width: '100vw', height: '100vh' }}>
      <PTBBuilder
        network={network}
        options={{
          themeSwitch: true,
          isEditor: false,
          txData,
        }}
      />
    </div>
  );
};
