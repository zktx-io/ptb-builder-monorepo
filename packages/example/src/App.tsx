import { useState } from 'react';

import { SuiClientProvider, WalletProvider } from '@mysten/dapp-kit';
import { getFullnodeUrl } from '@mysten/sui/client';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';

import { NETWORK } from './network';
import { Editor } from './pages/editor';
import { Home } from './pages/home';
import { Viewer } from './pages/viewer';

const router = createBrowserRouter([
  {
    path: '/',
    element: <Home />,
  },
  {
    path: '/editor',
    element: <Editor />,
  },
  {
    path: '/viewer',
    element: <Viewer />,
  },
]);

function App() {
  const [activeNetwork, setActiveNetwork] = useState<
    'testnet' | 'mainnet' | 'devnet'
  >(NETWORK);
  return (
    <SuiClientProvider
      networks={{
        mainnet: { url: getFullnodeUrl('mainnet') },
        testnet: { url: getFullnodeUrl('testnet') },
        devnet: { url: getFullnodeUrl('devnet') },
      }}
      defaultNetwork={activeNetwork as 'mainnet' | 'testnet' | 'devnet'}
      onNetworkChange={(network) => {
        setActiveNetwork(network);
      }}
    >
      <WalletProvider autoConnect>
        <RouterProvider router={router} />
      </WalletProvider>
    </SuiClientProvider>
  );
}

export default App;
