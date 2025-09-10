import {
  ConnectButton,
  useCurrentWallet,
  useSuiClientContext,
} from '@mysten/dapp-kit';
import { useNavigate } from 'react-router-dom';

import '@mysten/dapp-kit/dist/index.css';
import { NETWORKS, NetworkType, saveNetwork } from '../network';

export const Home = () => {
  const { connectionStatus } = useCurrentWallet();
  const navigate = useNavigate();
  const { network, selectNetwork } = useSuiClientContext();

  return (
    <div
      className="container"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        backgroundColor: '#011829',
        color: 'white',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 9999,
        fontSize: '24px',
        textAlign: 'center',
        userSelect: 'none',
        transition: 'opacity 0.3s ease',
      }}
    >
      <img src="/logo-sui.svg" alt="sui" className="logo" />
      <h1 className="title">PTB Builder</h1>

      <ConnectButton />

      <select
        value={network}
        onChange={(e) => {
          selectNetwork(e.target.value as NetworkType);
          saveNetwork(e.target.value as NetworkType);
        }}
        style={{
          marginTop: '12px',
          marginBottom: '12px',
          padding: '6px 12px',
          borderRadius: '6px',
          fontSize: '16px',
          color: 'black',
        }}
      >
        {NETWORKS.map((n) => (
          <option key={n} value={n}>
            {n.toUpperCase()}
          </option>
        ))}
      </select>

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
