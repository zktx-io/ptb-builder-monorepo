import { ConnectButton, useSuiClientContext } from '@mysten/dapp-kit';

import { NETWORKS, NetworkType, saveNetwork } from '../network';

type Props = {
  title?: string;
  subtitle?: string;
  showNetworkSelect?: boolean;
  footer?: React.ReactNode;
};

export function ConnectScreen({
  title = 'PTB Builder',
  subtitle = 'Connect your wallet to get started',
  showNetworkSelect = true,
  footer,
}: Props) {
  const { network, selectNetwork } = useSuiClientContext();

  return (
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
        zIndex: 9999,
        fontSize: '24px',
        textAlign: 'center',
        userSelect: 'none',
        transition: 'opacity 0.3s ease',
        padding: '24px',
        gap: '12px',
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

      <div style={{ marginTop: 12 }}>
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
            padding: '8px 12px',
            borderRadius: 8,
            fontSize: 16,
            color: 'black',
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
        style={{ position: 'fixed', bottom: 20, opacity: 0.7, fontSize: 14 }}
      >
        {footer ?? (
          <>
            Developed by <strong>zktx.io</strong>
          </>
        )}
      </div>
    </div>
  );
}
