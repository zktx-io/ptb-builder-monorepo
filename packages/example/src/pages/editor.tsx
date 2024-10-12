import { ConnectButton, useCurrentAccount } from '@mysten/dapp-kit';
import { PTBBuilder } from '@zktx.io/ptb-builder';

import { NETWORK } from '../network';

export const Editor = () => {
  const account = useCurrentAccount();
  return (
    <div style={{ width: '100vw', height: '100vh' }}>
      {account ? (
        <PTBBuilder
          network={NETWORK}
          options={{
            themeSwitch: true,
            isEditor: true,
          }}
        />
      ) : (
        <div
          style={{
            width: '100vw',
            height: '100vh',
            backgroundColor: 'black',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            flexDirection: 'column',
            position: 'relative',
          }}
        >
          <ConnectButton />
        </div>
      )}
    </div>
  );
};
