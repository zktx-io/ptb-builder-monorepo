import {
  ConnectButton,
  useCurrentAccount,
  useSignAndExecuteTransaction,
} from '@mysten/dapp-kit';
import { Transaction } from '@mysten/sui/transactions';
import { Chain, PTBBuilder, ToastVariant } from '@zktx.io/ptb-builder';
import { enqueueSnackbar } from 'notistack';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';

import '@mysten/dapp-kit/dist/index.css';
import '@zktx.io/walrus-wallet/index.css';

import { usePtbUndo } from './components/usePtbUndo';
import { Editor } from './pages/editor';
import { Home } from './pages/home';
import { Viewer } from './pages/viewer';
import { WalrusWallet } from '@zktx.io/walrus-wallet';
import { loadNetwork } from './network';

const router = createBrowserRouter([
  {
    path: '/',
    element: <Home />,
  },
  {
    path: '/editor',
    element: <Editor />,
  },
  {
    path: '/viewer',
    element: <Viewer />,
  },
]);

function App() {
  const account = useCurrentAccount();
  const { mutate: signAndExecuteTransaction } = useSignAndExecuteTransaction();
  const { set: onDocChange } = usePtbUndo();

  const handleToast = ({
    message,
    variant,
  }: {
    message: string;
    variant?: ToastVariant;
  }) => {
    enqueueSnackbar(message, { variant });
  };

  const executeTx = (
    chain: Chain,
    transaction: Transaction | undefined,
  ): Promise<{ digest?: string; error?: string }> => {
    return new Promise((resolve) => {
      if (account && transaction) {
        transaction
          .toJSON()
          .then((jsonTx) => {
            signAndExecuteTransaction(
              {
                transaction: jsonTx,
                chain,
              },
              {
                onSuccess: (result) => {
                  resolve({ digest: result.digest });
                },
                onError: (error) => {
                  resolve({
                    error: error.message || 'Transaction execution failed',
                  });
                },
              },
            );
          })
          .catch((error) => {
            resolve({
              error: error.message || 'Transaction serialization failed',
            });
          });
      }
    });
  };

  return (
    <div style={{ width: '100vw', height: '100vh' }}>
      {!account && (
        <div
          style={{
            width: '100%',
            height: '100%',
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
      <WalrusWallet network={loadNetwork()} onEvent={handleToast}>
        <PTBBuilder
          toast={handleToast}
          executeTx={executeTx}
          address={account?.address}
          showExportButton
          onDocChange={onDocChange}
        >
          <RouterProvider router={router} />
        </PTBBuilder>
      </WalrusWallet>
    </div>
  );
}

export default App;
