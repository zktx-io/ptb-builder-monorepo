import React from 'react';

import { SuiClientProvider, WalletProvider } from '@mysten/dapp-kit';
import { getFullnodeUrl } from '@mysten/sui/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SnackbarProvider } from 'notistack';
import ReactDOM from 'react-dom/client';

import './index.css';
import App from './App';
import { NETWORK } from './network';
import reportWebVitals from './reportWebVitals';

const queryClient = new QueryClient();

const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement,
);

root.render(
  <React.StrictMode>
    <SnackbarProvider
      anchorOrigin={{ horizontal: 'right', vertical: 'top' }}
      hideIconVariant
    >
      <QueryClientProvider client={queryClient}>
        <SuiClientProvider
          networks={{ devnet: { url: getFullnodeUrl(NETWORK) } }}
          defaultNetwork="devnet"
        >
          <WalletProvider autoConnect>
            <App />
          </WalletProvider>
        </SuiClientProvider>
      </QueryClientProvider>
    </SnackbarProvider>
  </React.StrictMode>,
);

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
