import { StrictMode } from 'react';

import { DAppKitProvider } from '@mysten/dapp-kit-react';
import { SnackbarProvider } from 'notistack';
import { createRoot } from 'react-dom/client';

import './index.css';
import App from './App.tsx';
import { dAppKit } from './dapp-kit.ts';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SnackbarProvider
      anchorOrigin={{ horizontal: 'right', vertical: 'top' }}
      hideIconVariant
    >
      <DAppKitProvider dAppKit={dAppKit}>
        <App />
      </DAppKitProvider>
    </SnackbarProvider>
  </StrictMode>,
);
