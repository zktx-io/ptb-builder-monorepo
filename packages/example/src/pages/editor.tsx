import React from 'react';

import {
  ConnectButton,
  useCurrentAccount,
  useSignAndExecuteTransaction,
  useSuiClientContext,
} from '@mysten/dapp-kit';
import { Transaction } from '@mysten/sui/transactions';
import { PTBBuilder } from '@zktx.io/ptb-builder';
import { enqueueSnackbar } from 'notistack';

import { DragAndDrop } from '../components/DragAndDrop';
import { NETWORK } from '../network';

export const Editor = () => {
  const ctx = useSuiClientContext();
  const account = useCurrentAccount();
  const [network, setNetwork] = React.useState<
    'mainnet' | 'testnet' | 'devnet'
  >(NETWORK);
  const [ptb, setPtb] = React.useState<string | undefined>(undefined);
  const { mutate: signAndExecuteTransaction } = useSignAndExecuteTransaction();

  const excuteTx = async (transaction: Transaction | undefined) => {
    if (account && transaction) {
      transaction.setSender(account.address);
      transaction.setGasOwner(account.address);
      // transaction.setGasPrice(10000);
      transaction.setGasBudget(10000000);

      // console.log(account.address);
      // console.log(await transaction.toJSON());

      signAndExecuteTransaction(
        {
          transaction,
          chain: `sui:${network}`,
        },
        {
          onSuccess: (result) => {
            enqueueSnackbar(`${result.digest}`, {
              variant: 'success',
            });
          },
          onError: (error) => {
            enqueueSnackbar(`${error}`, {
              variant: 'error',
            });
          },
        },
      );
    }
  };

  const handleDrop = (ptb: any) => {
    setNetwork((ptb as any).network);
    ctx.selectNetwork((ptb as any).network);
    setPtb(JSON.stringify(ptb));
  };

  return (
    <div style={{ width: '100vw', height: '100vh' }}>
      {account ? (
        <>
          <DragAndDrop onDrop={handleDrop} />
          <PTBBuilder
            wallet={account.address}
            network={network}
            excuteTx={excuteTx}
            txbOrPtb={ptb}
            update={(value: string) => {
              // console.log(value);
            }}
            options={{
              isEditor: true,
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
            backgroundColor: 'black',
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
