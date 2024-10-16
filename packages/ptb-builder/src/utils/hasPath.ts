import type { Edge, Node } from '@xyflow/react';

export const hasPath = (nodes: Node[], edges: Edge[]): boolean => {
  const startNode = nodes.find((node) => node.type === 'Start');
  const endNode = nodes.find((node) => node.type === 'End');

  if (!startNode || !endNode) {
    return false;
  }

  const pathExists = (currentNode: Node, visited: Set<string>): boolean => {
    if (currentNode.id === endNode.id) {
      return true;
    }

    visited.add(currentNode.id);

    const outgoingEdges = edges.filter(
      (edge) => edge.source === currentNode.id && edge.type === 'Path',
    );
    for (const edge of outgoingEdges) {
      const nextNode = nodes.find((node) => node.id === edge.target);
      if (nextNode && !visited.has(nextNode.id)) {
        if (pathExists(nextNode, visited)) {
          return true;
        }
      }
    }

    return false;
  };

  return pathExists(startNode, new Set());
};
