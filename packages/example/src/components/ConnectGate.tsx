import { PropsWithChildren } from 'react';
import { useCurrentWallet } from '@mysten/dapp-kit';
import { ConnectScreen } from './ConnectScreen';

type Props = PropsWithChildren<{
  title?: string;
  subtitle?: string;
  showNetworkSelect?: boolean;
  footer?: React.ReactNode;
}>;

export function ConnectGate({
  children,
  title,
  subtitle,
  showNetworkSelect = true,
  footer,
}: Props) {
  const { connectionStatus } = useCurrentWallet();

  if (connectionStatus !== 'connected') {
    return (
      <ConnectScreen
        title={title}
        subtitle={subtitle}
        showNetworkSelect={showNetworkSelect}
        footer={footer}
      />
    );
  }

  return <>{children}</>;
}
