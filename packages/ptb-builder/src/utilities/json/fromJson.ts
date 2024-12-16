import { DEFAULT, VERSION } from './types';
import { enqueueToast, NETWORK } from '../../provider';

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
    enqueueToast(`data error: ${data.version}, ${data.network}`, {
      variant: 'error',
    });
    return {
      version: VERSION,
      network: NETWORK.DevNet,
      nodes: [],
      edges: [],
    };
  } catch (error) {
    enqueueToast(`${error}`, {
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
