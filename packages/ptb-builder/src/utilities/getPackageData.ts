import {
  SuiClient,
  SuiMoveNormalizedFunction,
  SuiMoveNormalizedModule,
  SuiMoveNormalizedModules,
  SuiMoveNormalizedType,
} from '@mysten/sui/client';

import { enqueueToast } from '../provider';
import { PTBModuleData } from '../ptbFlow/nodes/types';

const deleteTxContext = (
  types: SuiMoveNormalizedType[],
): SuiMoveNormalizedType[] => {
  return types.filter((type) => {
    if (typeof type === 'object') {
      const struct =
        (type as any).MutableReference?.Struct ||
        (type as any).Reference?.Struct ||
        (type as any).Struct;
      return !(
        struct &&
        struct.address === '0x2' &&
        struct.module === 'tx_context' &&
        struct.name === 'TxContext'
      );
    }
    return true;
  });
};

export const toPTBModuleData = (
  data: SuiMoveNormalizedModules,
): PTBModuleData => {
  const processedModules: PTBModuleData = Object.entries(data).reduce(
    (acc, [moduleName, moduleData]: [string, SuiMoveNormalizedModule]) => {
      const functionNames = Object.keys(moduleData.exposedFunctions);
      const functions = functionNames.reduce<
        Record<string, SuiMoveNormalizedFunction>
      >((funcAcc, name) => {
        funcAcc[name] = {
          ...moduleData.exposedFunctions[name],
          parameters: deleteTxContext(
            moduleData.exposedFunctions[name].parameters,
          ),
        };
        return funcAcc;
      }, {});
      moduleData.exposedFunctions = functions;
      acc._nameModules_.push(moduleName);
      acc.modules[moduleName] = {
        ...moduleData,
        _nameFunctions_: functionNames,
      };
      return acc;
    },
    {
      _nameModules_: [],
      modules: {},
    } as PTBModuleData,
  );
  return processedModules;
};

export const getPackageData = async (
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
