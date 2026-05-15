import {
  useCurrentAccount,
  useCurrentNetwork,
  useDAppKit,
} from '@mysten/dapp-kit-react';
import { Transaction } from '@mysten/sui/transactions';
import { Chain, PTBBuilder, ToastVariant } from '@zktx.io/ptb-builder';
import { enqueueSnackbar } from 'notistack';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';

import '@zktx.io/ptb-builder/index.css';
import '@zktx.io/ptb-builder/styles/themes-all.css';

import { usePtbUndo } from './components/usePtbUndo';
import { SuiNetwork } from './network';
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

function chainToNetwork(chain: Chain): SuiNetwork {
  const match = chain.match(/^sui:(mainnet|testnet|devnet)$/);
  if (!match) {
    throw new Error(`Unsupported Sui chain: ${chain}`);
  }
  return match[1] as SuiNetwork;
}

function App() {
  const account = useCurrentAccount();
  const network = useCurrentNetwork() as SuiNetwork;
  const dAppKit = useDAppKit();
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
    const targetNetwork = chainToNetwork(chain);
    if (network !== targetNetwork) {
      return {
        error: `Switch to ${targetNetwork} before executing this PTB`,
      };
    }

    try {
      const result = await dAppKit.signAndExecuteTransaction({
        transaction,
      });
      if (result.$kind === 'FailedTransaction') {
        const statusError = result.FailedTransaction.status.error;
        const error =
          statusError?.message ||
          statusError?.$kind ||
          'Transaction execution failed';
        return { digest: result.FailedTransaction.digest, error };
      }
      return { digest: result.Transaction.digest };
    } catch (error: unknown) {
      return {
        error: (error as Error).message || 'Transaction execution failed',
      };
    }
  };

  const createClient = (chain: Chain) =>
    dAppKit.getClient(chainToNetwork(chain));

  const simulateTx = async (
    chain: Chain,
    transaction: Transaction | undefined,
  ): Promise<{ success?: boolean; error?: string }> => {
    if (!transaction) {
      return { error: 'No transaction to simulate' };
    }

    try {
      const client = createClient(chain);
      const bytes = await transaction.build({ client });
      const result = await client.core.simulateTransaction({
        transaction: bytes,
        include: { effects: true },
      });
      const simulated =
        result.$kind === 'Transaction'
          ? result.Transaction
          : result.FailedTransaction;
      const error =
        simulated.status.error?.message || simulated.status.error?.$kind;
      return { success: simulated.status.success, error };
    } catch (error: unknown) {
      return {
        error: (error as Error).message || 'Transaction simulation failed',
      };
    }
  };

  return (
    <div style={{ width: '100vw', height: '100vh' }}>
      <PTBBuilder
        toast={handleToast}
        executeTx={executeTx}
        simulateTx={simulateTx}
        createClient={createClient}
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
