import {
  ConnectButton,
  useCurrentAccount,
  useSignAndExecuteTransaction,
} from '@mysten/dapp-kit';
import { Transaction } from '@mysten/sui/transactions';
import { PTBBuilder } from '@zktx.io/ptb-builder';
import { enqueueSnackbar } from 'notistack';

import { NETWORK } from '../network';

export const Editor = () => {
  const account = useCurrentAccount();
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
          chain: `sui:${NETWORK}`,
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

  return (
    <div style={{ width: '100vw', height: '100vh' }}>
      {account ? (
        <PTBBuilder
          network={NETWORK}
          excuteTx={excuteTx}
          onChange={(value: any) => {
            // console.log(value);
          }}
          options={{
            themeSwitch: true,
          }}
        />
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
