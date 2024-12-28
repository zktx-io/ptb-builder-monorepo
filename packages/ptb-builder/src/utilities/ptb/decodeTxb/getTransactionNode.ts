import {
  SuiArgument,
  SuiMoveNormalizedType,
  SuiTransaction,
} from '@mysten/sui/client';

import { PTB } from '../../../components';
import { getTypeName } from '../../../ptbFlow/components';
import { PTBEdge, PTBNode } from '../../../ptbFlow/nodes';
import { PTBModuleData, TYPE_PARAMS } from '../../../ptbFlow/nodes/types';

const getVectorType = (
  arg: SuiArgument,
  dictionary: Record<string, PTBNode>,
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
      case PTB.MoveCall.Type:
      // TODO: Fix this type cast
      default:
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
      default:
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
  if (typeof arg === 'object' && 'NestedResult' in arg) {
    const [index, result] = arg.NestedResult;
    return {
      id,
      type: 'Data',
      source: `cmd-${index}`,
      sourceHandle: `result[${result}]:object`,
      target: targetId,
      targetHandle: `${targetHandle.name}:${targetHandle.type}`,
      deletable: false,
    };
  }
  return {
    id,
    type: 'Data',
    source: '@gasCoin',
    sourceHandle: 'inputs:object',
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
      getEdge(`path-0-${id}`, tx.SplitCoins[0], id, {
        name: 'coin',
        type: 'object',
      }),
    );
    edges.push(
      ...tx.SplitCoins[1].map((item, index) =>
        getEdge(`path-1-${index}-${id}`, item, id, {
          name: `amounts[${index}]`,
          type: 'number',
        }),
      ),
    );
    return {
      nodes: [
        {
          id,
          position: { x: 0, y: 0 },
          type: PTB.SplitCoins.Type,
          deletable: false,
          data: {
            label: PTB.SplitCoins.Name,
            splitInputs: edges.length - 1,
            splitOutputs: edges.length - 1,
          },
        },
      ],
      edges,
    };
  }
  if ('TransferObjects' in tx) {
    edges.push(
      ...tx.TransferObjects[0].map((item, index) =>
        getEdge(`path-0-${index}-${id}`, item, id, {
          name: `objects[${index}]`,
          type: 'object',
        }),
      ),
    );
    edges.push(
      getEdge(`path-1-${id}`, tx.TransferObjects[1], id, {
        name: 'address',
        type: 'address',
      }),
    );
    return {
      nodes: [
        {
          id,
          position: { x: 0, y: 0 },
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
      getEdge(`path-0-${id}`, tx.MergeCoins[0], id, {
        name: 'destination',
        type: 'object',
      }),
    );
    edges.push(
      ...tx.MergeCoins[1].map((item, index) =>
        getEdge(`path-1-${index}-${id}`, item, id, {
          name: `source[${index}]`,
          type: 'object',
        }),
      ),
    );
    return {
      nodes: [
        {
          id,
          position: { x: 0, y: 0 },
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
      const temp = getVectorType(item, dictionary);
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
          position: { x: 0, y: 0 },
          type: PTB.MakeMoveVec.Type,
          deletable: false,
          data: {
            label: PTB.MakeMoveVec.Name,
            splitInputs: tx.MakeMoveVec[1].length,
            makeMoveVector: makeMoveVector || 'object',
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
      argumentTypes.push({
        id: `input-${index}-${id}`,
        position: { x: 0, y: 0 },
        type: PTB.String.Type,
        deletable: false,
        data: {
          label: PTB.String.Name,
          value: arg,
        },
      });
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
      const temp = getTypeName(parameters[i]);
      temp.type &&
        edges.push(
          getEdge(`path-${index}-${id}`, arg, id, {
            name: `input[${i}]`,
            type: temp.type,
          }),
        );
      index++;
    });
    return {
      nodes: [
        {
          id,
          position: { x: 0, y: 0 },
          type: PTB.MoveCall.Type,
          deletable: false,
          data: {
            label: PTB.MoveCall.Name,
            moveCall: {
              package: tx.MoveCall.package,
              module: tx.MoveCall.module,
              function: tx.MoveCall.function,
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
          position: { x: 0, y: 0 },
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
          position: { x: 0, y: 0 },
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
