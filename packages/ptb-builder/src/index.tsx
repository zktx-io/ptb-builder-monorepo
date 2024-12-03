import React from 'react';

import { TransactionBlockData } from '@mysten/sui/client';
import { Transaction } from '@mysten/sui/transactions';
import { closeSnackbar, SnackbarProvider } from 'notistack';

import { IconButton } from './Components/IconButton';
import { IconCancel } from './Components/IconCancel';
import { NETWORK, StateProvider } from './Provider';
import { PTBFlow } from './PTBFlow';

import '@xyflow/react/dist/base.css';
import './index.css';

export const PTBBuilder = ({
  network,
  options,
}: {
  network?: 'mainnet' | 'testnet' | 'devnet';
  options: {
    isEditor: boolean;
    themeSwitch?: boolean;
    minZoom?: number;
    maxZoom?: number;
    txData?: TransactionBlockData;
    excuteTx?: (transaction: Transaction | undefined) => Promise<void>;
  };
}) => {
  return (
    <StateProvider
      txData={options.txData}
      isEditor={options.isEditor}
      network={(network as NETWORK | undefined) || NETWORK.DevNet}
    >
      <SnackbarProvider
        anchorOrigin={{ horizontal: 'right', vertical: 'top' }}
        hideIconVariant
        action={(snackbarId) => (
          <IconButton onClick={() => closeSnackbar(snackbarId)}>
            <IconCancel size={20} color="white" />
          </IconButton>
        )}
      />
      <PTBFlow
        networkSwitch={!network}
        themeSwitch={options.themeSwitch}
        excuteTx={options.excuteTx}
        minZoom={options.minZoom || 0.25}
        maxZoom={options.maxZoom || 2}
      />
    </StateProvider>
  );
};
