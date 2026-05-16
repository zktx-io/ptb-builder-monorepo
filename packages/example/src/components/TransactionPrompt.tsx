import type { ChangeEvent, KeyboardEvent } from 'react';

import { DAPP_NETWORKS } from '../dapp-kit';
import { SuiNetwork } from '../network';

type Props = {
  network: SuiNetwork;
  txValue: string;
  onNetworkChange: (network: SuiNetwork) => void;
  onTxChange: (value: string) => void;
  onLoad: () => void;
  canLoad: boolean;
};

export function TransactionPrompt({
  network,
  txValue,
  onNetworkChange,
  onTxChange,
  onLoad,
  canLoad,
}: Props) {
  const handleInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    onTxChange(event.target.value);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      onLoad();
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        width: '100%',
        height: '100%',
        backgroundColor: 'rgba(1, 24, 41, 0.2)',
        backdropFilter: 'blur(3px)',
        WebkitBackdropFilter: 'blur(6px)',
        color: 'white',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        textAlign: 'center',
        padding: '24px 0',
        gap: 20,
        userSelect: 'none',
        boxSizing: 'border-box',
      }}
    >
      <div
        style={{
          width: '90vw',
          maxWidth: 520,
          border: '2px dashed rgba(255,255,255,0.6)',
          borderRadius: 16,
          padding: 24,
          background: 'rgba(255, 255, 255, 0.06)',
          boxShadow: '0 10px 40px rgba(0,0,0,0.4)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 16,
          maxHeight: 'calc(100vh - 32px)',
          overflowY: 'auto',
          boxSizing: 'border-box',
          margin: '0 auto',
        }}
      >
        <img
          src="/logo-sui.svg"
          alt="sui"
          style={{ width: 92, height: 92, opacity: 0.9 }}
        />
        <h1 style={{ margin: '8px 0 0', fontSize: 32, fontWeight: 700 }}>
          PTB Viewer
        </h1>
        <p style={{ fontSize: 16, opacity: 0.9, marginTop: 4 }}>
          Pick a network and paste a transaction digest, then load the graph.
        </p>
        <div
          style={{
            width: '100%',
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
          }}
        >
          <select
            value={network}
            onChange={(event) =>
              onNetworkChange(event.target.value as SuiNetwork)
            }
            style={{
              padding: '12px 14px',
              borderRadius: 10,
              fontSize: 16,
              color: '#011829',
              backgroundColor: '#ffffff',
              border: 'none',
              cursor: 'pointer',
              boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
              width: '100%',
              boxSizing: 'border-box',
            }}
          >
            {DAPP_NETWORKS.map((n) => (
              <option key={n} value={n}>
                {n.toUpperCase()}
              </option>
            ))}
          </select>
          <input
            value={txValue}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder="0x1234…"
            style={{
              padding: '12px 14px',
              borderRadius: 10,
              fontSize: 16,
              border: 'none',
              outline: 'none',
              boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.3)',
              backgroundColor: 'rgba(255,255,255,0.08)',
              color: 'white',
              width: '100%',
              boxSizing: 'border-box',
            }}
          />
          <button
            disabled={!canLoad}
            onClick={onLoad}
            style={{
              marginTop: 8,
              padding: '14px',
              borderRadius: 10,
              fontSize: 16,
              fontWeight: 600,
              border: 'none',
              cursor: 'pointer',
              backgroundColor: '#ffffff',
              color: '#011829',
              opacity: canLoad ? 1 : 0.4,
              boxShadow: '0 4px 18px rgba(255,255,255,0.4)',
              width: '100%',
              boxSizing: 'border-box',
            }}
          >
            Load transaction
          </button>
        </div>
      </div>
    </div>
  );
}
