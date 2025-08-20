import React from 'react';

import {
  ConnectButton,
  useCurrentAccount,
  useSignAndExecuteTransaction,
  useSuiClientContext,
} from '@mysten/dapp-kit';
import { Transaction } from '@mysten/sui/transactions';
import {
  PTBBuilder,
  PTBGraph,
  PTBScheme,
  ToastVariant,
} from '@zktx.io/ptb-builder';
import { enqueueSnackbar } from 'notistack';

import { DragAndDrop } from '../components/DragAndDrop';
import { NETWORK } from '../network';

export const Editor = () => {
  const ctx = useSuiClientContext();
  const account = useCurrentAccount();
  const [network, setNetwork] = React.useState<
    'mainnet' | 'testnet' | 'devnet'
  >(NETWORK);
  const [ptb, setPtb] = React.useState<PTBScheme | undefined>(undefined);
  const { mutate: signAndExecuteTransaction } = useSignAndExecuteTransaction();

  const executeTx = (
    transaction: Transaction | undefined,
  ): Promise<{ digest?: string; error?: string }> => {
    return new Promise((resolve, reject) => {
      if (account && transaction) {
        transaction
          .toJSON()
          .then((jsonTx) => {
            signAndExecuteTransaction(
              {
                transaction: jsonTx,
                chain: `sui:${network}`,
              },
              {
                onSuccess: (result) => {
                  resolve({ digest: result.digest });
                },
                onError: (error) => {
                  reject({
                    error: error.message || 'Transaction execution failed',
                  });
                },
              },
            );
          })
          .catch((error) => {
            reject({
              error: error.message || 'Transaction serialization failed',
            });
          });
      }
    });
  };

  const handleToast = ({
    message,
    variant,
  }: {
    message: string;
    variant?: ToastVariant;
  }) => {
    enqueueSnackbar(message, { variant });
  };

  const handleDrop = (file: PTBScheme) => {
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
            onChancel={() =>
              setPtb({ ...ptb, network, sender: account.address } as PTBScheme)
            }
          />
          <PTBBuilder
            network={network}
            initialGraph={ptb?.graph}
            onChange={(g: PTBGraph) => {
              if (ptb) {
                setPtb({ ...ptb, graph: g });
              } else {
                setPtb({
                  version: 'ptb_3',
                  network,
                  sender: account.address,
                  graph: g,
                } as PTBScheme);
              }
            }}
            adapters={{
              executeTx,
              toast: handleToast,
            }}
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
