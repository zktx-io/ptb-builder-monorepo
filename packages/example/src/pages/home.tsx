import { ConnectButton, useCurrentWallet } from '@mysten/dapp-kit';
import { useNavigate } from 'react-router-dom';

import '@mysten/dapp-kit/dist/index.css';
import { NETWORK } from '../network';

export const Home = () => {
  const { connectionStatus } = useCurrentWallet();
  const navigate = useNavigate();

  return (
    <div className="container">
      <img src="/logo-sui.svg" alt="sui" className="logo" />
      <h1 className="title">PTB Builder</h1>
      <ConnectButton />
      {connectionStatus === 'connected' && (
        <p style={{ color: 'white' }}>{`${NETWORK.toUpperCase()}`}</p>
      )}
      <div className="button-container">
        {connectionStatus === 'connected' && (
          <>
            <button
              className="action-button"
              onClick={() => navigate('/editor')}
            >
              Editor
            </button>
            <button
              className="action-button"
              onClick={() => navigate('/viewer?tx=')}
            >
              Viewer
            </button>
          </>
        )}
      </div>
      <div className="footer">
        Developed by <strong>zktx.io</strong>
      </div>
    </div>
  );
};
