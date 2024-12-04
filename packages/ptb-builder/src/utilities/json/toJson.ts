import { DEFAULT, VERSION } from './types';

export const toJson = (data: DEFAULT): string => {
  // eslint-disable-next-line no-restricted-syntax
  return JSON.stringify({ version: VERSION, ...data }, null, 2);
};
