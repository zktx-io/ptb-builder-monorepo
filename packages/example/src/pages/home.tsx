import { ConnectButton, useSuiClientContext } from '@mysten/dapp-kit';
import { useNavigate } from 'react-router-dom';

import { NETWORKS, NetworkType, saveNetwork } from '../network';
import { ConnectGate } from '../components/ConnectGate';

export const Home = () => {
  const navigate = useNavigate();
  const { network, selectNetwork } = useSuiClientContext();

  return (
    <ConnectGate
      title="PTB Builder"
      subtitle="Connect your wallet to build or view PTBs"
    >
      <div
        style={{
          position: 'fixed',
          inset: 0,
          width: '100vw',
          height: '100vh',
          backgroundColor: '#011829',
          color: 'white',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 1,
          textAlign: 'center',
          gap: 16,
        }}
      >
        <img
          src="/logo-sui.svg"
          alt="sui"
          style={{ width: 92, height: 92, opacity: 0.9 }}
        />
        <h1 className="title" style={{ margin: 0 }}>
          PTB Builder
        </h1>

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

        <div className="button-container" style={{ display: 'flex', gap: 12 }}>
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
          className="footer"
          style={{ position: 'fixed', bottom: 20, opacity: 0.7, fontSize: 14 }}
        >
          Developed by <strong>zktx.io</strong>
        </div>
      </div>
    </ConnectGate>
  );
};
