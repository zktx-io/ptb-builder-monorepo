import { getBlockData } from './getBlockData';
import { getInputNode } from './getInputNode';
import { getTransactionNode } from './getTransactionNode';
import { PTB } from '../../../components';
import { enqueueToast, NETWORK } from '../../../provider';
import { PTBEdge, PTBNode } from '../../../ptbFlow/nodes';
import { PTBModuleData } from '../../../ptbFlow/nodes/types';

const InitX = -300;

export const decodeTxb = async (
  network: NETWORK,
  txHash: string,
  fetchPackageData: (packageId: string) => Promise<PTBModuleData | undefined>,
): Promise<{ nodes: PTBNode[]; edges: PTBEdge[] }> => {
  const {
    status,
    data: { transaction: txb },
  } = await getBlockData(network, txHash);

  if (txb.kind === 'ProgrammableTransaction') {
    const dictionary: Record<string, PTBNode> = {};
    const nodes: PTBNode[] = [];
    const extraNodes: PTBNode[] = [];
    const edges: PTBEdge[] = [];

    nodes.push({
      id: '@start',
      position: { x: InitX, y: 0 },
      type: PTB.Start.Type,
      deletable: false,
      data: {
        label: PTB.Start.Name,
      },
    });

    nodes.push({
      id: '@end',
      position: { x: InitX, y: 0 },
      type: PTB.End.Type,
      deletable: false,
      data: {
        label: PTB.End.Name,
        value: status
          ? status.status === 'success'
            ? [status.status]
            : [status.status, status.error || '']
          : undefined,
      },
    });

    nodes.push({
      id: '@gasCoin',
      position: { x: InitX, y: 0 },
      type: PTB.ObjectGas.Type,
      deletable: false,
      data: {
        label: PTB.ObjectGas.Name,
      },
    });

    txb.inputs.forEach((input, index) => {
      const temp = getInputNode(`input-${index}`, input);
      if (temp) {
        dictionary[temp.id] = temp;
        nodes.push(temp);
      } else {
        enqueueToast(`not support input type: ${input.type}`, {
          variant: 'warning',
        });
      }
    });

    const moveCalls = txb.transactions
      .filter((item) => 'MoveCall' in item)
      .map((item) => item.MoveCall.package);

    const modules: Record<string, PTBModuleData | undefined> = {};
    for (const packageId of moveCalls) {
      modules[packageId] = await fetchPackageData(packageId);
    }

    txb.transactions.forEach((tx, index) => {
      const temp = getTransactionNode(`cmd-${index}`, tx, dictionary, modules);
      if (temp) {
        edges.push({
          id: `path-${index}`,
          type: 'Command',
          source: index === 0 ? '@start' : nodes[nodes.length - 1].id,
          sourceHandle: 'src:command',
          target: temp.nodes[0].id,
          targetHandle: 'tgt:command',
          deletable: false,
        });
        temp.nodes.forEach((node) => {
          dictionary[node.id] = node;
        });
        nodes.push(temp.nodes[0]);
        if (temp.nodes.length > 1) {
          extraNodes.push(...temp.nodes.slice(1));
        }
        edges.push(...temp.edges);
      } else {
        enqueueToast(`not support transaction type: ${Object.keys(tx)[0]}`, {
          variant: 'error',
        });
      }
    });

    edges.push({
      id: `path-${edges.length + 1}`,
      type: 'Command',
      source: nodes[nodes.length - 1].id,
      sourceHandle: 'src:command',
      target: '@end',
      targetHandle: 'tgt:command',
      deletable: false,
    });

    nodes.push(...extraNodes);
    const usedInputIds = new Set(edges.map((edge) => edge.source));
    const filteredNodes = nodes.filter((input) =>
      input.id.startsWith('input-') || input.id === '@gasCoin'
        ? usedInputIds.has(input.id)
        : true,
    );

    return { nodes: filteredNodes, edges };
  } else {
    enqueueToast(`not support transaction: ${txb.kind}`, {
      variant: 'warning',
    });
  }

  return { nodes: [], edges: [] };
};
