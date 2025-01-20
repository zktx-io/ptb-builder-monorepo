import {
  SuiArgument,
  SuiMoveNormalizedType,
  SuiTransaction,
} from '@mysten/sui/client';

import { PTB } from '../../../components';
import { readPackageData } from '../../../provider';
import { getTypeName } from '../../../ptbFlow/components';
import { PTBEdge, PTBNode } from '../../../ptbFlow/nodes';
import { PTBModuleData, TYPE_PARAMS } from '../../../ptbFlow/nodes/types';

const InitX = -300;

const getMakeMoveVectorInputType = (
  arg: SuiArgument,
  dictionary: Record<string, PTBNode>,
  modules: Record<string, PTBModuleData | undefined>,
): { source: string; sourceHandle: string } | undefined => {
  if (typeof arg === 'object' && 'Input' in arg) {
    const type = dictionary[`input-${arg.Input}`].type;
    switch (type) {
      case PTB.String.Type:
        return { source: `input-${arg.Input}`, sourceHandle: 'inputs:string' };
      case PTB.Number.Type:
        return { source: `input-${arg.Input}`, sourceHandle: 'inputs:number' };
      case PTB.Bool.Type:
        return { source: `input-${arg.Input}`, sourceHandle: 'inputs:bool' };
      case PTB.Address.Type:
        return { source: `input-${arg.Input}`, sourceHandle: 'inputs:address' };
      case PTB.Object.Type:
        return { source: `input-${arg.Input}`, sourceHandle: 'inputs:object' };
    }
  }
  if (typeof arg === 'object' && 'Result' in arg) {
    const type = dictionary[`cmd-${arg.Result}`].type;
    switch (type) {
      case PTB.SplitCoins.Type:
        return {
          source: `cmd-${arg.Result}`,
          sourceHandle: `result[0]:object`,
        };
      case PTB.MoveCall.Type:
        const moveCall = dictionary[`cmd-${arg.Result}`].data.moveCall;
        if (
          moveCall &&
          moveCall.package &&
          moveCall.module &&
          moveCall.function
        ) {
          const results =
            modules[moveCall.package]?.modules[moveCall.module]
              .exposedFunctions[moveCall?.function!].return;
          if (results) {
            const result = results[0];
            return typeof result === 'object' && 'Struct' in result
              ? { source: `cmd-${arg.Result}`, sourceHandle: `result:object` }
              : undefined;
          }
        }
      default:
        break;
    }
  }
  if (typeof arg === 'object' && 'NestedResult' in arg) {
    const type = dictionary[`cmd-${arg.NestedResult[0]}`].type;
    switch (type) {
      case PTB.SplitCoins.Type:
        return {
          source: `cmd-${arg.NestedResult[0]}`,
          sourceHandle: `result[${arg.NestedResult[1]}]:object`,
        };
      case PTB.MoveCall.Type:
        const moveCall = dictionary[`cmd-${arg.NestedResult[0]}`].data.moveCall;
        if (
          moveCall &&
          moveCall.package &&
          moveCall.module &&
          moveCall.function
        ) {
          const results =
            modules[moveCall.package]?.modules[moveCall.module]
              .exposedFunctions[moveCall?.function!].return;
          if (results) {
            const result = results[arg.NestedResult[1]];
            return typeof result === 'object' && 'Struct' in result
              ? {
                  source: `cmd-${arg.NestedResult[0]}`,
                  sourceHandle: `result[${arg.NestedResult[1]}]:object`,
                }
              : undefined;
          }
        }
      default:
        break;
    }
  }
  return undefined;
};

const getEdge = (
  id: string,
  arg: SuiArgument,
  targetId: string,
  targetHandle: {
    name: string;
    type: string;
  },
  dictionary: Record<string, PTBNode>,
): PTBEdge => {
  if (typeof arg === 'object' && 'Input' in arg) {
    const index = arg.Input;
    return {
      id,
      type: 'Data',
      source: `input-${index}`,
      sourceHandle: `inputs:${targetHandle.type}`,
      target: targetId,
      targetHandle: `${targetHandle.name}:${targetHandle.type}`,
      deletable: false,
    };
  }
  if (typeof arg === 'object' && 'Result' in arg) {
    const index = arg.Result;
    if (dictionary[`cmd-${index}`].type !== PTB.SplitCoins.Type) {
      return {
        id,
        type: 'Data',
        source: `cmd-${index}`,
        sourceHandle: `result:${targetHandle.type}`,
        target: targetId,
        targetHandle: `${targetHandle.name}:${targetHandle.type}`,
        deletable: false,
      };
    } else {
      return {
        id,
        type: 'Data',
        source: `cmd-${index}`,
        sourceHandle: `result[0]:${targetHandle.type}`,
        target: targetId,
        targetHandle: `${targetHandle.name}:${targetHandle.type}`,
        deletable: false,
      };
    }
  }
  if (typeof arg === 'object' && 'NestedResult' in arg) {
    const [index, result] = arg.NestedResult;
    if (dictionary[`cmd-${index}`].type === PTB.MoveCall.Type) {
      const node = dictionary[`cmd-${index}`];
      const moduleData = node.data.moveCall?.package
        ? readPackageData(node.data.moveCall.package)
        : undefined;
      const returnLength =
        moduleData &&
        moduleData.modules[node.data.moveCall!.module!].exposedFunctions[
          node.data.moveCall!.function!
        ].return.length;
      if (returnLength === 1) {
        return {
          id,
          type: 'Data',
          source: `cmd-${index}`,
          sourceHandle: `result:${targetHandle.type}`,
          target: targetId,
          targetHandle: `${targetHandle.name}:${targetHandle.type}`,
          deletable: false,
        };
      }
    }
    return {
      id,
      type: 'Data',
      source: `cmd-${index}`,
      sourceHandle: `result[${result}]:${targetHandle.type}`,
      target: targetId,
      targetHandle: `${targetHandle.name}:${targetHandle.type}`,
      deletable: false,
    };
  }
  return {
    id,
    type: 'Data',
    source: '@gasCoin',
    sourceHandle: `inputs:${targetHandle.type}`,
    target: targetId,
    targetHandle: `${targetHandle.name}:${targetHandle.type}`,
    deletable: false,
  };
};

export const getTransactionNode = (
  id: string,
  tx: SuiTransaction,
  dictionary: Record<string, PTBNode>,
  modules: Record<string, PTBModuleData | undefined>,
): { nodes: PTBNode[]; edges: PTBEdge[] } | undefined => {
  const edges: PTBEdge[] = [];
  if ('SplitCoins' in tx) {
    edges.push(
      getEdge(
        `path-0-${id}`,
        tx.SplitCoins[0],
        id,
        {
          name: 'coin',
          type: 'object',
        },
        dictionary,
      ),
    );
    edges.push(
      ...tx.SplitCoins[1].map((item, index) =>
        getEdge(
          `path-1-${index}-${id}`,
          item,
          id,
          {
            name: `amounts[${index}]`,
            type: 'number',
          },
          dictionary,
        ),
      ),
    );
    return {
      nodes: [
        {
          id,
          position: { x: InitX, y: 0 },
          type: PTB.SplitCoins.Type,
          deletable: false,
          data: {
            label: PTB.SplitCoins.Name,
            splitInputs: edges.length - 1,
          },
        },
      ],
      edges,
    };
  }
  if ('TransferObjects' in tx) {
    edges.push(
      ...tx.TransferObjects[0].map((item, index) =>
        getEdge(
          `path-0-${index}-${id}`,
          item,
          id,
          {
            name: `objects[${index}]`,
            type: 'object',
          },
          dictionary,
        ),
      ),
    );
    edges.push(
      getEdge(
        `path-1-${id}`,
        tx.TransferObjects[1],
        id,
        {
          name: 'address',
          type: 'address',
        },
        dictionary,
      ),
    );
    return {
      nodes: [
        {
          id,
          position: { x: InitX, y: 0 },
          type: PTB.TransferObjects.Type,
          deletable: false,
          data: {
            label: PTB.TransferObjects.Name,
            splitInputs: edges.length - 1,
          },
        },
      ],
      edges,
    };
  }
  if ('MergeCoins' in tx) {
    edges.push(
      getEdge(
        `path-0-${id}`,
        tx.MergeCoins[0],
        id,
        {
          name: 'destination',
          type: 'object',
        },
        dictionary,
      ),
    );
    edges.push(
      ...tx.MergeCoins[1].map((item, index) =>
        getEdge(
          `path-1-${index}-${id}`,
          item,
          id,
          {
            name: `source[${index}]`,
            type: 'object',
          },
          dictionary,
        ),
      ),
    );
    return {
      nodes: [
        {
          id,
          position: { x: InitX, y: 0 },
          type: PTB.MergeCoins.Type,
          deletable: false,
          data: {
            label: PTB.MergeCoins.Name,
            splitInputs: edges.length - 1,
          },
        },
      ],
      edges,
    };
  }
  if ('MakeMoveVec' in tx) {
    let makeMoveVector: TYPE_PARAMS | undefined = undefined;

    if (tx.MakeMoveVec[0]) {
      makeMoveVector = tx.MakeMoveVec[0] as TYPE_PARAMS;
    }
    tx.MakeMoveVec[1].forEach((item, index) => {
      const temp = getMakeMoveVectorInputType(item, dictionary, modules);
      if (temp) {
        makeMoveVector = temp.sourceHandle.split(':')[1] as TYPE_PARAMS;
        temp &&
          edges.push({
            type: 'Data',
            id: `path-${index}-${id}`,
            source: temp.source,
            sourceHandle: temp.sourceHandle,
            target: id,
            targetHandle: `elements[${index}]:${makeMoveVector}`,
          });
      }
    });

    return {
      nodes: [
        {
          id,
          position: { x: InitX, y: 0 },
          type: PTB.MakeMoveVec.Type,
          deletable: false,
          data: {
            label: PTB.MakeMoveVec.Name,
            splitInputs: tx.MakeMoveVec[1].length,
            makeMoveVector: {
              type: makeMoveVector || 'object',
              omit: true,
            },
          },
        },
      ],
      edges,
    };
  }
  if ('MoveCall' in tx) {
    let index = 0;
    const argumentTypes: PTBNode[] = [];
    const parameters: SuiMoveNormalizedType[] =
      modules[tx.MoveCall.package]?.modules[tx.MoveCall.module]
        ?.exposedFunctions[tx.MoveCall.function].parameters || [];
    tx.MoveCall.type_arguments?.forEach((arg) => {
      switch (arg) {
        case '0x2::sui::SUI':
        case '0x0000000000000000000000000000000000000000000000000000000000000002::sui::SUI':
          argumentTypes.push({
            id: `input-${index}-${id}`,
            position: { x: InitX, y: 0 },
            type: PTB.String0x2suiSUI.Type,
            deletable: false,
            data: {
              label: PTB.String0x2suiSUI.Name,
              value: arg,
            },
          });
          break;
        default:
          argumentTypes.push({
            id: `input-${index}-${id}`,
            position: { x: InitX, y: 0 },
            type: PTB.String.Type,
            deletable: false,
            data: {
              label: PTB.String.Name,
              value: arg,
            },
          });
          break;
      }
      edges.push({
        type: 'Data',
        id: `path-${index}-${id}`,
        source: `input-${index}-${id}`,
        sourceHandle: 'inputs:string',
        target: id,
        targetHandle: `type[${index}]:string`,
      });
      index++;
    });
    tx.MoveCall.arguments?.forEach((arg, i) => {
      const temp = getTypeName(parameters[i], []);
      temp.type &&
        edges.push(
          getEdge(
            `path-${index}-${id}`,
            arg,
            id,
            {
              name: `input[${i}]`,
              type: temp.type,
            },
            dictionary,
          ),
        );
      index++;
    });
    return {
      nodes: [
        {
          id,
          position: { x: InitX, y: 0 },
          type: PTB.MoveCall.Type,
          deletable: false,
          data: {
            label: PTB.MoveCall.Name,
            moveCall: {
              package: tx.MoveCall.package,
              module: tx.MoveCall.module,
              function: tx.MoveCall.function,
              getTypeArgs: () => tx.MoveCall.type_arguments || [],
            },
          },
        },
        ...argumentTypes,
      ],
      edges,
    };
  }
  if ('Publish' in tx) {
    return {
      nodes: [
        {
          id,
          position: { x: InitX, y: 0 },
          type: PTB.Publish.Type,
          deletable: false,
          data: {
            label: PTB.Publish.Name,
          },
        },
      ],
      edges,
    };
  }
  if ('Upgrade' in tx) {
    return {
      nodes: [
        {
          id,
          position: { x: InitX, y: 0 },
          type: PTB.Upgrade.Type,
          deletable: false,
          data: {
            label: PTB.Upgrade.Name,
          },
        },
      ],
      edges,
    };
  }
  return undefined;
};
