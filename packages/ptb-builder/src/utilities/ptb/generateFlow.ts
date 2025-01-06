import { getPath } from '../';
import { readPackageData } from '../../provider';
import { getTypeName } from '../../ptbFlow/components';
import { PTBEdge, PTBNode, PTBNodeType } from '../../ptbFlow/nodes';
import { NumericTypes, TYPE_PARAMS } from '../../ptbFlow/nodes/types';

const extractIndex = (sourceHandle: string): number | undefined => {
  const match = sourceHandle.match(/\[(.*?)\](?=[^:]*:)/);
  return match ? parseInt(match[1], 10) : undefined;
};

const isVariableNode = (node: PTBNode): boolean => {
  switch (node.type) {
    case PTBNodeType.Start:
    case PTBNodeType.End:
    case PTBNodeType.SplitCoins:
    case PTBNodeType.MoveCall:
    case PTBNodeType.MergeCoins:
    case PTBNodeType.TransferObjects:
    case PTBNodeType.MakeMoveVec:
    case PTBNodeType.Publish:
    case PTBNodeType.Upgrade:
      return false;
    default:
      break;
  }
  return true;
};

const preprocess = (
  node: PTBNode,
  params: Record<string, PTBEdge>,
  dictionary: Record<string, { node: PTBNode; outputs?: string[] }>,
): {
  targets: [string, ...Array<string[]>];
  sources?: string[];
} => {
  const getSourceHandleID = (prefix: string, type: string): string => {
    const handle = `${prefix}:${type}`;
    if (params[handle]) {
      const source = dictionary[params[handle].source];
      if (
        isVariableNode(source.node) ||
        params[handle].sourceHandle?.startsWith('result:')
      ) {
        return source.node.id;
      }
      const sourceIndex = extractIndex(params[handle].sourceHandle!);
      if (sourceIndex !== undefined) {
        return `${source.node.id}[${sourceIndex}]`;
      }
    }
    return '';
  };

  const fromArray = (handle: string): string[] => {
    if (handle.endsWith('[]') && params[handle]) {
      const source = dictionary[params[handle].source];
      const sourceId = dictionary[params[handle].source].node.id;
      if (isVariableNode(source.node)) {
        const { length } = dictionary[params[handle].source].node.data
          .value as any[];
        return new Array(length)
          .fill(undefined)
          .map((_, index) => `${sourceId}[${index}]`);
      } else if (source.outputs) {
        return source.outputs.map((_, index) => `${sourceId}[${index}]`);
      } else {
        return [`${sourceId}[]`];
      }
    }
    return [''];
  };

  const fromSplit = (
    type: TYPE_PARAMS | 'number',
    length: number,
  ): string[] => {
    const data: string[] = new Array(length).fill('');
    Object.keys(params)
      .filter((key) => key.endsWith(type))
      .sort()
      .forEach((key) => {
        const edge = params[key];
        const targetIndex = extractIndex(edge.targetHandle!);
        const sourceIndex = extractIndex(edge.sourceHandle!);
        if (targetIndex !== undefined && targetIndex < data.length) {
          data[targetIndex] =
            sourceIndex !== undefined
              ? `${edge.source}[${sourceIndex}]`
              : edge.source;
        }
      });
    return data;
  };

  const forMoveCall = (prefix: string, length: number): string[] => {
    const data: string[] = new Array(length).fill('');
    Object.keys(params)
      .filter((key) => key.startsWith(prefix))
      .sort()
      .forEach((key) => {
        const edge = params[key];
        const targetIndex = extractIndex(edge.targetHandle!);
        const sourceIndex = extractIndex(edge.sourceHandle!);
        if (targetIndex !== undefined && targetIndex < data.length) {
          data[targetIndex] =
            sourceIndex !== undefined
              ? `${edge.source}[${sourceIndex}]`
              : edge.source;
        }
      });
    return data;
  };

  switch (node.type) {
    case PTBNodeType.SplitCoins: {
      const coin = getSourceHandleID('coin', 'object');
      const amounts = params['amounts:number[]']
        ? fromArray('amounts:number[]')
        : params['result:number[]']
          ? fromArray('result:number[]')
          : node.data.splitInputs
            ? fromSplit('number', node.data.splitInputs)
            : [''];
      return {
        targets: [coin, amounts],
        sources: node.data.splitOutputs
          ? new Array(node.data.splitOutputs || amounts.length)
              .fill(undefined)
              .map((_, index) => `result[${index}]:object`)
          : ['result:object[]'],
      };
    }
    case PTBNodeType.TransferObjects: {
      const address = getSourceHandleID('address', 'address');
      const objects = params['objects:object[]']
        ? fromArray('objects:object[]')
        : params['result:object[]']
          ? fromArray('result:object[]')
          : node.data.splitInputs
            ? fromSplit('object', node.data.splitInputs)
            : [''];
      return {
        targets: [address, objects],
      };
    }
    case PTBNodeType.MergeCoins: {
      const destination = getSourceHandleID('destination', 'object');
      const source = params['source:object[]']
        ? fromArray('source:object[]')
        : params['result:object[]']
          ? fromArray('result:object[]')
          : node.data.splitInputs
            ? fromSplit('object', node.data.splitInputs)
            : [''];
      return {
        targets: [destination, source],
      };
    }
    case PTBNodeType.MakeMoveVec: {
      const type = node.data.makeMoveVector!;
      const elementType = `${NumericTypes.has(type) ? 'number' : type}[]`;
      const element = params[`elements:${elementType}`]
        ? fromArray(`elements:${elementType}`)
        : params[`result:${elementType}`]
          ? fromArray(`result:${elementType}`)
          : node.data.splitInputs
            ? fromSplit(
                NumericTypes.has(type) ? 'number' : type,
                node.data.splitInputs,
              )
            : [''];
      return {
        targets: [type, element],
        sources: [`result<${type}>`],
      };
    }
    case PTBNodeType.MoveCall: {
      const target = node.data.moveCall
        ? `${node.data.moveCall.package}::${node.data.moveCall.module}::${node.data.moveCall.function}`
        : '';
      const moduleData =
        node.data.moveCall &&
        node.data.moveCall.package &&
        readPackageData(node.data.moveCall.package);
      let splitTypes = 0;
      let splitInputs = 0;
      const sources: string[] = [];
      if (moduleData && node.data.moveCall) {
        splitTypes = node.data.moveCall.module
          ? moduleData.modules[node.data.moveCall.module].exposedFunctions[
              node.data.moveCall.function!
            ].typeParameters.length
          : 0;
        splitInputs = node.data.moveCall.module
          ? moduleData.modules[node.data.moveCall.module].exposedFunctions[
              node.data.moveCall.function!
            ].parameters.length
          : 0;
        sources.push(
          ...(node.data.moveCall.module
            ? moduleData.modules[node.data.moveCall.module].exposedFunctions[
                node.data.moveCall.function!
              ].return.length > 1
              ? moduleData.modules[node.data.moveCall.module].exposedFunctions[
                  node.data.moveCall.function!
                ].return.map(
                  (type, index) =>
                    `result[${index}]:${getTypeName(type, []).type}`,
                )
              : [
                  `result:${
                    getTypeName(
                      moduleData.modules[node.data.moveCall.module]
                        .exposedFunctions[node.data.moveCall.function!]
                        .return[0],
                      [],
                    ).type
                  }`,
                ]
            : []),
        );
      }
      const typeParams = forMoveCall('type', splitTypes);
      const params = forMoveCall('input', splitInputs);
      return {
        targets: [target, [...typeParams], [...params]],
        sources,
      };
    }
    case PTBNodeType.Publish:
      return { targets: ['', ['']], sources: ['result:object'] };
    case PTBNodeType.Upgrade:
      return { targets: ['', ['']], sources: ['result:object'] };
    default:
      return { targets: ['', ['']] };
  }
};

export const generateFlow = (
  nodes: PTBNode[],
  edges: PTBEdge[],
): {
  inputs: Record<string, PTBNode>;
  commands: {
    node: PTBNode;
    targets: [string, ...Array<string[]>];
    sources?: string[];
  }[];
} => {
  const startNode = nodes.find((node) => node.type === PTBNodeType.Start);
  const endNode = nodes.find((node) => node.type === PTBNodeType.End);

  if (!startNode || !endNode) {
    throw new Error('Start or End node missing.');
  }

  const path = getPath(nodes, edges);

  if (path.length === 0) {
    return { inputs: {}, commands: [] };
  }

  const inputs: Record<string, PTBNode> = {};
  const commands: {
    node: PTBNode;
    targets: [string, ...Array<string[]>];
    sources?: string[];
  }[] = [];
  const dictionary: Record<
    string,
    {
      node: PTBNode;
      targets?: [string, ...Array<string[]>];
      sources?: string[];
    }
  > = Object.fromEntries(nodes.map((node) => [node.id, { node }]));

  path.forEach((node) => {
    try {
      const params: Record<string, PTBEdge> = {};
      edges
        .filter((edge) => edge.type === 'Data' && edge.target === node.id)
        .forEach((edge) => {
          if (edge.targetHandle && !params[edge.targetHandle]) {
            params[edge.targetHandle] = edge;
          }
          if (isVariableNode(dictionary[edge.source].node)) {
            inputs[edge.source] = dictionary[edge.source].node;
          }
        });
      const { targets, sources } = preprocess(node, params, dictionary);
      commands.push({ node, targets, sources });
      dictionary[node.id] = {
        ...dictionary[node.id],
        targets,
        sources,
      };
    } catch (error) {
      throw new Error("Can't generate preprocess");
    }
  });

  return { inputs, commands };
};
