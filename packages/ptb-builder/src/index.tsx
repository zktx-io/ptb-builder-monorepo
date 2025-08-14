import React from 'react';

import { Transaction } from '@mysten/sui/transactions';
import { ReactFlowProvider } from '@xyflow/react';

import { EnqueueToast, NETWORK, StateProvider } from './provider';
import { PTBFlow } from './ptbFlow';
import '@xyflow/react/dist/base.css';
import './index.css';
import { PTB_SCHEME } from './utilities';

export { PTB_SCHEME } from './utilities';

export const PTBBuilder = ({
  wallet,
  network,
  restore,
  update,
  executeTx,
  enqueueToast,
  options,
}: {
  wallet?: string;
  network?: 'mainnet' | 'testnet' | 'devnet';
  restore?: string | PTB_SCHEME;
  update?: (ptb: PTB_SCHEME) => void;
  executeTx?: (transaction: Transaction | undefined) => Promise<void>;
  enqueueToast?: EnqueueToast;
  options?: {
    themeSwitch?: boolean;
    minZoom?: number;
    maxZoom?: number;
    canEdit?: boolean;
  };
}) => {
  const [backup, setBackup] = React.useState<string | undefined>(undefined);
  return (
    <ReactFlowProvider>
      <StateProvider
        wallet={wallet}
        canEdit={!!options?.canEdit}
        network={(network as NETWORK | undefined) || NETWORK.DevNet}
        enqueueToast={enqueueToast}
      >
        <PTBFlow
          disableNetwork={!!network}
          themeSwitch={options?.themeSwitch}
          restore={restore}
          executeTx={executeTx}
          update={(data) => {
            const temp = JSON.stringify(data);
            if (update && temp !== backup) {
              setBackup(temp);
              update(data);
            }
          }}
          minZoom={options?.minZoom || 0.25}
          maxZoom={options?.maxZoom || 2}
        />
      </StateProvider>
    </ReactFlowProvider>
  );
};
