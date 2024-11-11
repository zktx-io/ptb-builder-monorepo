import React from 'react';

import { TransactionBlockData } from '@mysten/sui/client';
import { Transaction } from '@mysten/sui/transactions';
import { closeSnackbar, SnackbarProvider } from 'notistack';

import { CancelIcon } from './Components/CancelIcon';
import { IconButton } from './Components/IconButton';
import { StateProvider } from './Provider';
import { PTBFlow } from './PTBFlow';

import '@xyflow/react/dist/base.css';
import './index.css';

export const PTBBuilder = ({
  network,
  options,
}: {
  network: 'mainnet' | 'testnet' | 'devnet';
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
    <StateProvider txData={options.txData} isEditor={options.isEditor}>
      <SnackbarProvider
        anchorOrigin={{ horizontal: 'right', vertical: 'top' }}
        hideIconVariant
        action={(snackbarId) => (
          <IconButton onClick={() => closeSnackbar(snackbarId)}>
            <CancelIcon size={20} color="white" />
          </IconButton>
        )}
      />
      <PTBFlow
        network={network}
        themeSwitch={options.themeSwitch}
        excuteTx={options.excuteTx}
        minZoom={options.minZoom || 0.25}
        maxZoom={options.maxZoom || 2}
      />
    </StateProvider>
  );
};
