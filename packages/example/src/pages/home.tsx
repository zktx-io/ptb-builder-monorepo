import { ConnectButton, useCurrentWallet } from '@mysten/dapp-kit';
import { useNavigate } from 'react-router-dom';

import '@mysten/dapp-kit/dist/index.css';

export const Home = () => {
  const { connectionStatus } = useCurrentWallet();
  const navigate = useNavigate();

  return (
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
      <img
        style={{
          height: '128px',
          width: '128px',
        }}
        src="/logo-sui.svg"
      />
      <h1
        style={{
          color: 'white',
          fontSize: '34px',
          marginTop: '12px',
          marginBottom: '24px',
        }}
      >
        PTB Builder
      </h1>
      <ConnectButton />
      <div style={{ marginTop: '12px' }}>
        {connectionStatus === 'connected' && (
          <div style={{ color: 'white' }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                flexDirection: 'column',
                marginTop: '12px',
              }}
            >
              <button
                onClick={() => {
                  navigate('/editor');
                }}
              >
                {'editor >>'}
              </button>
              <button
                onClick={() => {
                  navigate('/viewer?tx=');
                }}
              >
                {'viewer >>'}
              </button>
            </div>
          </div>
        )}
      </div>
      <div
        style={{
          position: 'absolute',
          bottom: '10px',
          color: 'white',
          textAlign: 'center',
        }}
      >
        Developed by zktx.io
      </div>
    </div>
  );
};
