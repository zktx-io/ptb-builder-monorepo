import React from 'react';

import { TransactionBlockData } from '@mysten/sui/client';
import { Transaction } from '@mysten/sui/transactions';
import { closeSnackbar, SnackbarProvider } from 'notistack';

import { IconButton } from './Components/IconButton';
import { IconCancel } from './Components/IconCancel';
import { NETWORK, StateProvider } from './Provider';
import { PTBFlow } from './PTBFlow';
import { toJson } from './utilities/json/toJson';
import '@xyflow/react/dist/base.css';
import './index.css';

export const PTBBuilder = ({
  address,
  network,
  txData,
  ptbJson,
  onChange,
  excuteTx,
  options,
}: {
  address?: string;
  network?: 'mainnet' | 'testnet' | 'devnet';
  txData?: TransactionBlockData;
  ptbJson?: string;
  onChange?: (ptbJson: string) => void;
  excuteTx?: (transaction: Transaction | undefined) => Promise<void>;
  options?: {
    themeSwitch?: boolean;
    minZoom?: number;
    maxZoom?: number;
  };
}) => {
  return (
    <StateProvider
      address={address}
      txData={txData}
      ptbJson={ptbJson}
      isEditor={!txData}
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
        excuteTx={excuteTx}
        themeSwitch={options?.themeSwitch}
        onChange={(data) => {
          onChange && onChange(toJson({ ...data }));
        }}
        minZoom={options?.minZoom || 0.25}
        maxZoom={options?.maxZoom || 2}
      />
    </StateProvider>
  );
};
