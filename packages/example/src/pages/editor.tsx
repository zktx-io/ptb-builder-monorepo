import React from 'react';

import {
  ConnectButton,
  useCurrentAccount,
  useSignAndExecuteTransaction,
  useSuiClientContext,
} from '@mysten/dapp-kit';
import { Transaction } from '@mysten/sui/transactions';
import { PTB_SCHEME, PTBBuilder } from '@zktx.io/ptb-builder';
import { enqueueSnackbar } from 'notistack';

import { DragAndDrop } from '../components/DragAndDrop';
import { NETWORK } from '../network';

export const Editor = () => {
  const ctx = useSuiClientContext();
  const account = useCurrentAccount();
  const [network, setNetwork] = React.useState<
    'mainnet' | 'testnet' | 'devnet'
  >(NETWORK);
  const [ptb, setPtb] = React.useState<PTB_SCHEME | undefined>(undefined);
  const [backup, setBackup] = React.useState<PTB_SCHEME | undefined>(undefined);
  const { mutate: signAndExecuteTransaction } = useSignAndExecuteTransaction();

  const excuteTx = async (transaction: Transaction | undefined) => {
    if (account && transaction) {
      // console.log(account.address);
      // console.log(await transaction.toJSON());

      const jsonTx = await transaction.toJSON();

      signAndExecuteTransaction(
        {
          transaction: jsonTx,
          chain: `sui:${network}`,
        },
        {
          onSuccess: (result) => {
            enqueueSnackbar(`${result.digest}`, {
              variant: 'success',
            });
            setPtb(backup);
          },
          onError: (error) => {
            enqueueSnackbar(`${error}`, {
              variant: 'error',
            });
            setPtb(backup);
          },
        },
      );
    }
  };

  const handleDrop = (file: PTB_SCHEME) => {
    setNetwork(file.network || NETWORK);
    ctx.selectNetwork(file.network || NETWORK);
    setPtb(file);
  };

  return (
    <div style={{ width: '100vw', height: '100vh' }}>
      {account ? (
        <>
          <DragAndDrop
            onDrop={handleDrop}
            onChancel={() => setPtb({ version: '2', modules: {} })}
          />
          <PTBBuilder
            wallet={account.address}
            network={network}
            excuteTx={excuteTx}
            restore={ptb}
            update={(file: PTB_SCHEME) => {
              setBackup(file);
              // console.log(value);
            }}
            options={{
              canEdit: true,
              themeSwitch: true,
            }}
            enqueueToast={(message, options) =>
              enqueueSnackbar(message, options)
            }
          />
        </>
      ) : (
        <div
          style={{
            width: '100vw',
            height: '100vh',
            backgroundColor: '#011829',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            flexDirection: 'column',
            position: 'relative',
          }}
        >
          <ConnectButton />
        </div>
      )}
    </div>
  );
};
