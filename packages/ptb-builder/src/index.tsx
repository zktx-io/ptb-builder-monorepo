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
  address,
  network,
  txbOrPtb,
  update,
  excuteTx,
  options,
}: {
  address?: string;
  network?: 'mainnet' | 'testnet' | 'devnet';
  txbOrPtb?: TransactionBlockData | string;
  update?: (ptbJson: string) => void;
  excuteTx?: (transaction: Transaction | undefined) => Promise<void>;
  options?: {
    themeSwitch?: boolean;
    minZoom?: number;
    maxZoom?: number;
    isEditor?: boolean;
  };
}) => {
  return (
    <StateProvider
      address={address}
      txbOrPtb={txbOrPtb}
      isEditor={options ? !!options.isEditor : false}
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
        excuteTx={excuteTx}
        disableNetwork={!!network}
        themeSwitch={options?.themeSwitch}
        update={(data) => {
          update && update(data);
        }}
        minZoom={options?.minZoom || 0.25}
        maxZoom={options?.maxZoom || 2}
      />
    </StateProvider>
  );
};
