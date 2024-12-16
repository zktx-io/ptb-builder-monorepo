import { PTBEdge, PTBNode, PTBNodeType } from '../ptbFlow/nodes';

export const getPath = (nodes: PTBNode[], edges: PTBEdge[]): PTBNode[] => {
  const startNode = nodes.find((node) => node.type === PTBNodeType.Start);
  const endNode = nodes.find((node) => node.type === PTBNodeType.End);

  if (!startNode || !endNode) {
    return [];
  }

  const trace = (
    currentNode: PTBNode,
    path: PTBNode[],
  ): PTBNode[] | undefined => {
    currentNode.type !== PTBNodeType.Start &&
      currentNode.type !== PTBNodeType.End &&
      path.push(currentNode);

    if (currentNode.id === endNode.id) {
      return path;
    }

    const outgoingEdge = edges.find(
      (edge) => edge.source === currentNode.id && edge.type === 'Path',
    );
    if (!outgoingEdge) {
      return undefined;
    }

    const nextNode = nodes.find((node) => node.id === outgoingEdge.target);
    if (!nextNode) {
      return undefined;
    }

    return trace(nextNode, path);
  };

  const result = trace(startNode, []);
  return result ? result : [];
};
