import { SuiClient, SuiMoveNormalizedModules } from '@mysten/sui/client';

import { enqueueToast } from '../provider';

const buffer = new Map<string, SuiMoveNormalizedModules>();

export const getPackageData = async (
  client: SuiClient | undefined,
  packageId: string,
): Promise<SuiMoveNormalizedModules | undefined> => {
  if (buffer.has(packageId)) {
    return buffer.get(packageId);
  }
  if (client) {
    try {
      const modules: SuiMoveNormalizedModules =
        await client.getNormalizedMoveModulesByPackage({
          package: packageId,
        });
      buffer.set(packageId, modules);
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
