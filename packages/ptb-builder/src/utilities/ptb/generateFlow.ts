import { PTBEdge, PTBNode, PTBNodeType } from '../../ptbFlow/nodes';
import { NumericTypes, TYPE_PARAMS } from '../../ptbFlow/nodes/types';
import { getPath } from '../getPath';

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
    case PTBNodeType.Publish:
    case PTBNodeType.TransferObjects:
    case PTBNodeType.MakeMoveVec:
      return false;
    default:
      break;
  }
  return true;
};

const preprocess = (
  node: PTBNode,
  params: Record<string, PTBEdge>,
  dictionary: Record<
    string,
    { node: PTBNode; outputs?: (string | undefined)[] }
  >,
): { inputs: (string | undefined)[][]; outputs?: (string | undefined)[] } => {
  const getSourceHandleID = (
    prefix: string,
    type: string,
  ): string | undefined => {
    const handle = `${prefix}:${type}`;
    if (params[handle]) {
      const source = dictionary[params[handle].source];
      if (isVariableNode(source.node)) {
        return source.node.id;
      }
      const index = extractIndex(params[handle].sourceHandle!);
      if (index !== undefined) {
        return `${source.node.id}[${index}]`;
      }
    }
    return undefined;
  };

  const fromArray = (handle: string): (string | undefined)[] => {
    if (handle.endsWith('[]') && params[handle]) {
      const source = dictionary[params[handle].source];
      const sourceId = dictionary[params[handle].source].node.id;
      if (isVariableNode(source.node)) {
        const { length } = dictionary[params[handle].source].node.data
          .value as any[];
        return new Array(length)
          .fill(undefined)
          .map((_, index) => `${sourceId}[${index}]`);
      }
      if (source.outputs) {
        return source.outputs.map((_, index) => `${sourceId}[${index}]`);
      }
    }
    return [undefined];
  };

  const fromSplit = (
    type: TYPE_PARAMS | 'number',
    length: number,
  ): (string | undefined)[] => {
    const data: (string | undefined)[] = new Array(length).fill(undefined);
    Object.keys(params)
      .filter((key) => key.endsWith(type))
      .sort()
      .forEach((key) => {
        const edge = params[key];
        const targetIndex = extractIndex(edge.targetHandle!);
        const sourceIndex = extractIndex(edge.sourceHandle!);
        data[targetIndex!] =
          sourceIndex !== undefined
            ? `${edge.source}[${sourceIndex}]`
            : edge.source;
      });
    return data;
  };

  const forMoveCall = (
    prefix: string,
    length: number,
  ): (string | undefined)[] => {
    const data: (string | undefined)[] = new Array(length).fill(undefined);
    Object.keys(params)
      .filter((key) => key.startsWith(prefix))
      .sort()
      .forEach((key) => {
        const edge = params[key];
        const targetIndex = extractIndex(edge.targetHandle!);
        const sourceIndex = extractIndex(edge.sourceHandle!);
        data[targetIndex!] =
          sourceIndex !== undefined
            ? `${edge.source}[${sourceIndex}]`
            : edge.source;
      });
    return data;
  };

  const ioLength = node.data.getIoLength
    ? node.data.getIoLength()
    : [undefined, undefined];

  switch (node.type) {
    case PTBNodeType.SplitCoins: {
      const coin = getSourceHandleID('coin', 'object');
      const amounts =
        params['amounts:number[]'] || ioLength[0] === undefined
          ? fromArray('amounts:number[]')
          : fromSplit('number', ioLength[0]);
      return {
        inputs: [[coin], amounts],
        outputs: new Array(ioLength[1] || amounts.length).fill(undefined),
      };
    }
    case PTBNodeType.TransferObjects: {
      const address = getSourceHandleID('address', 'address');
      const objects =
        params['objects:object[]'] || ioLength[0] === undefined
          ? fromArray('objects:object[]')
          : fromSplit('object', ioLength[0]);
      return {
        inputs: [[address], objects],
      };
    }
    case PTBNodeType.MergeCoins: {
      const destination = getSourceHandleID('destination', 'object');
      const source =
        params['source:object[]'] || ioLength[0] === undefined
          ? fromArray('source:object[]')
          : fromSplit('object', ioLength[0]);
      return {
        inputs: [[destination], source],
      };
    }
    case PTBNodeType.MakeMoveVec: {
      const type = node.data.makeMoveVector!;
      const element =
        params[`elements:${NumericTypes.has(type) ? 'number' : type}[]`] ||
        ioLength[0] === undefined
          ? fromArray(`elements:${NumericTypes.has(type) ? 'number' : type}[]`)
          : fromSplit(NumericTypes.has(type) ? 'number' : type, ioLength[0]);
      return {
        inputs: [[type], element],
        outputs: [undefined],
      };
    }
    case PTBNodeType.MoveCall: {
      const target = node.data.moveCall
        ? [
            node.data.moveCall.package,
            node.data.moveCall.module,
            node.data.moveCall.function,
          ]
        : [undefined];
      const typeParams = forMoveCall('type', ioLength[0] || 0);
      const params = forMoveCall('input', ioLength[1] || 0);
      return {
        inputs: [[...target], [...params], [...typeParams]],
        outputs: new Array(ioLength[2] || 0).fill(undefined),
      };
    }
    case PTBNodeType.Publish:
      return { inputs: [], outputs: [undefined] };
    default:
      return { inputs: [] };
  }
};

export const generateFlow = (
  nodes: PTBNode[],
  edges: PTBEdge[],
): {
  inputs: Record<string, PTBNode>;
  commands: {
    node: PTBNode;
    inputs: (string | undefined)[][];
    results?: (string | undefined)[];
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
    inputs: (string | undefined)[][];
    results?: (string | undefined)[];
  }[] = [];
  const dictionary: Record<
    string,
    {
      node: PTBNode;
      inputs: (string | undefined)[][];
      outputs?: (string | undefined)[];
    }
  > = Object.fromEntries(nodes.map((node) => [node.id, { node, inputs: [] }]));

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
      const temp = preprocess(node, params, dictionary);
      commands.push({ node, inputs: temp.inputs, results: temp.outputs });
      dictionary[node.id] = {
        ...dictionary[node.id],
        inputs: temp.inputs,
        outputs: temp.outputs,
      };
    } catch (error) {
      throw new Error("Can't generate preprocess");
    }
  });

  return { inputs, commands };
};
