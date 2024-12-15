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

import { NETWORK } from '../network';

export const Viewer = () => {
  const initialized = useRef<boolean>(false);

  const location = useLocation();
  const [txData, setTxData] = useState<TransactionBlockData | undefined>(
    undefined,
  );

  useEffect(() => {
    const lodaData = async (txHash: string) => {
      initialized.current = true;
      try {
        const client = new SuiClient({
          url: getFullnodeUrl(NETWORK),
        });
        const res = await client.getTransactionBlock({
          digest: txHash!,
          options: {
            showInput: true,
            showObjectChanges: true,
          },
        });
        if (res.transaction) {
          console.log(res.transaction.data);
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
        network={NETWORK}
        txbOrPtb={txData}
        options={{
          isEditor: false,
          themeSwitch: true,
        }}
        update={(value: string) => {
          // console.log(value);
        }}
        enqueueToast={(message, options) => enqueueSnackbar(message, options)}
      />
    </div>
  );
};
