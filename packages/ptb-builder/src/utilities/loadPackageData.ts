import { SuiClient, SuiMoveNormalizedModules } from '@mysten/sui/client';
import { enqueueSnackbar } from 'notistack';

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
      enqueueSnackbar(`${error}`, {
        variant: 'error',
      });
      return undefined;
    }
  }
  enqueueSnackbar('client error', {
    variant: 'error',
  });
  return undefined;
};
