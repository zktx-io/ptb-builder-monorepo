import {
  useCurrentAccount,
  useSignAndExecuteTransaction,
} from '@mysten/dapp-kit';
import { Transaction } from '@mysten/sui/transactions';
import { Chain, PTBBuilder, ToastVariant } from '@zktx.io/ptb-builder';
import { enqueueSnackbar } from 'notistack';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';

import '@mysten/dapp-kit/dist/index.css';
import '@zktx.io/ptb-builder/index.css';
import '@zktx.io/ptb-builder/styles/themes-all.css';

import { usePtbUndo } from './components/usePtbUndo';
import { Editor } from './pages/editor';
import { Home } from './pages/home';
import { Viewer } from './pages/viewer';

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

  const executeTx = async (
    chain: Chain,
    transaction: Transaction | undefined,
  ): Promise<{ digest?: string; error?: string }> => {
    if (!account) {
      return { error: 'Wallet not connected' };
    }
    if (!transaction) {
      return { error: 'No transaction to execute' };
    }

    try {
      const jsonTx = await transaction.toJSON();

      return await new Promise((resolve) => {
        try {
          signAndExecuteTransaction(
            {
              transaction: jsonTx,
              chain,
            },
            {
              onSuccess: (result) => resolve({ digest: result.digest }),
              onError: (error) =>
                resolve({
                  error: error.message || 'Transaction execution failed',
                }),
            },
          );
        } catch (error: unknown) {
          resolve({
            error:
              (error as Error).message ||
              'Transaction execution failed (sync error)',
          });
        }
      });
    } catch (error: unknown) {
      return {
        error: (error as Error).message || 'Transaction serialization failed',
      };
    }
  };

  return (
    <div style={{ width: '100vw', height: '100vh' }}>
      <PTBBuilder
        toast={handleToast}
        executeTx={executeTx}
        address={account?.address}
        showExportButton
        onDocChange={onDocChange}
      >
        <RouterProvider router={router} />
      </PTBBuilder>
    </div>
  );
}

export default App;
