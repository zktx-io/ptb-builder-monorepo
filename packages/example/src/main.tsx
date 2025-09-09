import { StrictMode } from 'react';

import { SuiClientProvider, WalletProvider } from '@mysten/dapp-kit';
import { getFullnodeUrl } from '@mysten/sui/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SnackbarProvider } from 'notistack';
import { createRoot } from 'react-dom/client';

import './index.css';
import App from './App.tsx';

const queryClient = new QueryClient();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SnackbarProvider
      anchorOrigin={{ horizontal: 'right', vertical: 'top' }}
      hideIconVariant
    >
      <QueryClientProvider client={queryClient}>
        <SuiClientProvider
          networks={{
            mainnet: { url: getFullnodeUrl('mainnet') },
            testnet: { url: getFullnodeUrl('testnet') },
            devnet: { url: getFullnodeUrl('devnet') },
          }}
          defaultNetwork={'testnet'}
        >
          <WalletProvider autoConnect>
            <App />
          </WalletProvider>
        </SuiClientProvider>
      </QueryClientProvider>
    </SnackbarProvider>
  </StrictMode>,
);
