import { SuiClient, SuiMoveNormalizedModules } from '@mysten/sui/client';

import { enqueueToast } from '../_provider';

export const loadPackageData = async (
  client: SuiClient | undefined,
  packageId: string,
): Promise<SuiMoveNormalizedModules | undefined> => {
  if (client) {
    try {
      const modules: SuiMoveNormalizedModules =
        await client.getNormalizedMoveModulesByPackage({
          package: packageId,
        });
      return modules;
    } catch (error) {
      enqueueToast(`${error}`, {
        variant: 'error',
      });
      return undefined;
    }
  }
  enqueueToast('client error', {
    variant: 'error',
  });
  return undefined;
};
