import React, {
  createContext,
  ReactNode,
  useContext,
  useEffect,
  useState,
} from 'react';

import { SuiClient, TransactionBlockData } from '@mysten/sui/client';
import { ColorModeClass } from '@xyflow/react';

export enum NETWORK {
  MainNet = 'mainnet',
  TestNet = 'testnet',
  DevNet = 'devnet',
}

export const NETWORKS: NETWORK[] = [
  NETWORK.DevNet,
  NETWORK.TestNet,
  // NETWORK.MainNet,
];

export interface IState {
  colorMode: ColorModeClass;
  hasPath: boolean;
  isEditor: boolean;
  network: NETWORK;
  client?: SuiClient;
  txbOrPtb?: TransactionBlockData | string;
  address?: string;
  disableUpdate?: boolean;
}

const StateContext = createContext<IState | undefined>(undefined);
const StateUpdateContext = createContext<
  React.Dispatch<React.SetStateAction<IState>> | undefined
>(undefined);

export const StateProvider = ({
  isEditor,
  network,
  txbOrPtb,
  children,
  address,
}: {
  isEditor: boolean;
  network: NETWORK;
  txbOrPtb?: TransactionBlockData | string;
  address?: string;
  children: ReactNode;
}) => {
  const [state, setState] = useState<IState>({
    network,
    colorMode: 'dark',
    hasPath: false,
    isEditor,
    address,
  });

  useEffect(() => {
    setState((oldState) => ({ ...oldState, isEditor, txbOrPtb }));
  }, [isEditor, txbOrPtb]);

  return (
    <StateContext.Provider value={state}>
      <StateUpdateContext.Provider value={setState}>
        {children}
      </StateUpdateContext.Provider>
    </StateContext.Provider>
  );
};

export const useStateContext = () => {
  const context = useContext(StateContext);
  if (context === undefined) {
    throw new Error('useStateContext must be used within a StateProvider');
  }
  return context;
};

export const useStateUpdateContext = () => {
  const context = useContext(StateUpdateContext);
  if (context === undefined) {
    throw new Error(
      'useStateUpdateContext must be used within a StateProvider',
    );
  }
  return context;
};
