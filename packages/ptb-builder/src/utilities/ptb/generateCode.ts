import { PTBEdge, PTBNode, PTBNodeType } from '../../ptbFlow/nodes';
import { getPath } from '../getPath';

export const generateCode = (nodes: PTBNode[], edges: PTBEdge[]): string => {
  const startNode = nodes.find((node) => node.type === PTBNodeType.Start);
  const endNode = nodes.find((node) => node.type === PTBNodeType.End);

  if (!startNode || !endNode) {
    return 'Start or End node missing.';
  }

  const path = getPath(nodes, edges);

  if (path.length === 0) {
    return '';
  }

  const codeLines: { line: string; comment: string }[] = [
    {
      line: "// import { Transaction } from '@mysten/sui/transactions';",
      comment: '',
    },
    {
      line: "// import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';",
      comment: '',
    },
    { line: '', comment: '' },
    {
      line: 'const keypair = new Ed25519Keypair();',
      comment: '',
    },
    {
      line: 'const myAddress = keypair.getPublicKey().toSuiAddress();',
      comment: '',
    },
    { line: 'const tx = new Transaction();', comment: '' },
    { line: '', comment: '' },
  ];

  const addCodeLine = (line: string, comment: string) => {
    codeLines.push({ line, comment });
  };

  let result = 1;
  let variable = 1;
  const variables: Record<string, { name: string; node: PTBNode }> = {};
  const dictionary: Record<string, string> = {};

  const getInputEdges = (id: string): PTBEdge[] => {
    const temp = edges.filter(
      (edge) => edge.target === id && edge.type === 'Data',
    );
    temp.forEach((edge) => {
      nodes.forEach((node) => {
        if (
          node.id === edge.source &&
          node.type !== PTBNodeType.MakeMoveVec &&
          node.type !== PTBNodeType.SplitCoins &&
          node.type !== PTBNodeType.MoveCall &&
          node.type !== PTBNodeType.MergeCoins &&
          node.type !== PTBNodeType.TransferObjects &&
          node.type !== PTBNodeType.Publish
        ) {
          if (!variables[node.id]) {
            const name = `var_${variable++}`;
            variables[node.id] = { name, node };
            dictionary[node.id] = name;
          }
        }
      });
    });
    return temp;
  };

  const process: { name: string; node: PTBNode; inputs: PTBEdge[] }[] =
    path.map((node) => {
      if (
        node.type === PTBNodeType.MakeMoveVec ||
        node.type === PTBNodeType.SplitCoins ||
        node.type === PTBNodeType.MoveCall
      ) {
        const name = `result_${result++}`;
        dictionary[node.id] = name;
        return {
          name,
          node,
          inputs: getInputEdges(node.id),
        };
      }
      return { name: '', node, inputs: getInputEdges(node.id) };
    });

  Object.keys(variables).forEach((key) => {
    const temp = variables[key].node;
    const value = temp.data.value
      ? Array.isArray(temp.data.value)
        ? `[${temp.data.value.map((v) => (typeof v === 'string' && v !== 'tx.gas' && v !== 'myAddress' ? `'${v}'` : v)).join(',')}]`
        : typeof temp.data.value === 'string' &&
            temp.data.value !== 'tx.gas' &&
            temp.data.value !== 'myAddress'
          ? `'${temp.data.value}'`
          : temp.data.value
      : 'undefined';
    addCodeLine(`const ${variables[key].name} = ${value};`, '');
  });

  process.forEach(({ name, node, inputs }) => {
    if (typeof node.data.code === 'function') {
      if (name) {
        if (
          node.type === PTBNodeType.SplitCoins ||
          node.type === PTBNodeType.MoveCall
        ) {
          addCodeLine(
            `const [...${name}] = ${node.data.code(dictionary, inputs)};`,
            '',
          );
        } else {
          addCodeLine(
            `const ${name} = ${node.data.code(dictionary, inputs)};`,
            '',
          );
        }
      } else {
        addCodeLine(`${node.data.code(dictionary, inputs)};`, '');
      }
    } else {
      addCodeLine(`// ${node.type};`, '');
    }
  });

  const paddingSize = 40;
  const formattedCode =
    codeLines.length > 2
      ? codeLines
          .map((lineObj) =>
            lineObj.comment
              ? `${lineObj.line.padEnd(paddingSize)} // ${lineObj.comment}`.trim()
              : `${lineObj.line.padEnd(paddingSize)}`,
          )
          .join('\n')
      : '';

  return formattedCode;
};
