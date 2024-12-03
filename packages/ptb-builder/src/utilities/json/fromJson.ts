import { enqueueSnackbar } from 'notistack';

import { DEFAULT, VERSION } from './types';
import { NETWORK } from '../../Provider';

export const fromJson = (json: string): DEFAULT => {
  try {
    const data = JSON.parse(json);
    if (
      data.version === VERSION &&
      (data.network === NETWORK.DevNet ||
        data.network === NETWORK.TestNet ||
        data.network === NETWORK.MainNet)
    ) {
      return data;
    }
    enqueueSnackbar(`data error: ${data.version}, ${data.network}`, {
      variant: 'error',
    });
    return {
      version: VERSION,
      network: NETWORK.DevNet,
      nodes: [],
      edges: [],
    };
  } catch (error) {
    enqueueSnackbar(`${error}`, {
      variant: 'error',
    });
    return {
      version: VERSION,
      network: NETWORK.DevNet,
      nodes: [],
      edges: [],
    };
  }
};
