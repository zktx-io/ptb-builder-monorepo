import { ReactNode } from 'react';
import {
  useCurrentWallet,
  ConnectButton,
  useSuiClientContext,
} from '@mysten/dapp-kit';
import { NETWORKS, NetworkType, saveNetwork } from '../network';
import { useNavigate } from 'react-router-dom';

type Props = {
  title?: string;
  subtitle?: string;
  showNetworkSelect?: boolean;
  connected?: ReactNode;
};

export function ConnectScreen({
  title = 'PTB Builder',
  subtitle = 'Connect your wallet to get started',
  showNetworkSelect = true,
  connected,
}: Props) {
  const { connectionStatus } = useCurrentWallet();
  const navigate = useNavigate();
  const { network, selectNetwork } = useSuiClientContext();

  if (connectionStatus === 'connected' && connected) {
    return <>{connected}</>;
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        width: '100vw',
        height: '100vh',
        backgroundColor: 'rgba(1, 24, 41, 0.2)',
        backdropFilter: 'blur(3px)',
        WebkitBackdropFilter: 'blur(6px)',
        color: 'white',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        textAlign: 'center',
        padding: 24,
        gap: 20,
        userSelect: 'none',
      }}
    >
      <img
        src="/logo-sui.svg"
        alt="sui"
        style={{ width: 92, height: 92, opacity: 0.9 }}
      />
      <h1 style={{ margin: '8px 0 0', fontSize: 32, fontWeight: 700 }}>
        {title}
      </h1>
      {subtitle && (
        <p style={{ fontSize: 16, opacity: 0.8, marginTop: 4 }}>{subtitle}</p>
      )}

      <div style={{ marginTop: 8 }}>
        <ConnectButton />
      </div>

      {showNetworkSelect && (
        <select
          value={network}
          onChange={(e) => {
            const val = e.target.value as NetworkType;
            selectNetwork(val);
            saveNetwork(val);
          }}
          style={{
            marginTop: 12,
            padding: '10px 12px',
            borderRadius: 10,
            fontSize: 16,
            color: '#011829',
            backgroundColor: '#ffffff',
            border: 'none',
            cursor: 'pointer',
            boxShadow: '0 2px 10px rgba(0,0,0,0.2)',
            minWidth: 200,
          }}
        >
          {NETWORKS.map((n) => (
            <option key={n} value={n}>
              {n.toUpperCase()}
            </option>
          ))}
        </select>
      )}

      <div
        className="button-container"
        style={{ display: 'flex', gap: 12, marginTop: 12 }}
      >
        <button className="action-button" onClick={() => navigate('/editor')}>
          Editor
        </button>
        <button
          className="action-button"
          onClick={() => navigate('/viewer?tx=')}
        >
          Viewer
        </button>
      </div>

      <div
        style={{ position: 'fixed', bottom: 20, opacity: 0.7, fontSize: 14 }}
      >
        Developed by <strong>zktx.io</strong>
      </div>
    </div>
  );
}
