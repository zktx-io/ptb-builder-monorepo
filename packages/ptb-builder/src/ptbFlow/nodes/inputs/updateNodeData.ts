import { Node } from '@xyflow/react';

type UpdateNodeDataProps<T extends Record<string, unknown>> = {
  nodes: Node<T>[];
  nodeId: string;
  updater: (data: T) => T;
};

export const updateNodeData = <T extends Record<string, unknown> = any>({
  nodes,
  nodeId,
  updater,
}: UpdateNodeDataProps<T>): Node<T>[] => {
  return nodes.map((node) => {
    if (node.id === nodeId) {
      return {
        ...node,
        data: updater(node.data),
      };
    }
    return node;
  });
};
