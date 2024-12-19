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
  const nodeDictory: Record<string, PTBNode> = Object.fromEntries(
    nodes.map((node) => [node.id, node]),
  );

  const getInputEdges = (id: string): PTBEdge[] => {
    return edges.filter((edge) => {
      if (edge.target === id && edge.type === 'Data') {
        const node = nodeDictory[edge.source];
        if (
          node &&
          node.type &&
          !variables[node.id] &&
          [
            PTBNodeType.Address,
            PTBNodeType.AddressArray,
            PTBNodeType.AddressVector,
            PTBNodeType.AddressWallet,
            PTBNodeType.Bool,
            PTBNodeType.BoolArray,
            PTBNodeType.BoolVector,
            PTBNodeType.Number,
            PTBNodeType.NumberArray,
            PTBNodeType.NumberVector,
            PTBNodeType.Object,
            PTBNodeType.ObjectArray,
            PTBNodeType.ObjectVector,
            PTBNodeType.ObjectGas,
            PTBNodeType.String,
          ].includes(node.type as PTBNodeType)
        ) {
          const name = `var_${variable++}`;
          variables[node.id] = { name, node };
          dictionary[node.id] = name;
        }
        return true;
      }
      return false;
    });
  };

  const process: { name: string; node: PTBNode; inputs: PTBEdge[] }[] =
    path.map((node) => {
      switch (node.type) {
        case PTBNodeType.SplitCoins: {
          const name = `result_${result++}`;
          const inputs = getInputEdges(node.id);
          const amounts = inputs.find((input) =>
            input.targetHandle?.endsWith('number[]'),
          );
          if (amounts && nodeDictory[amounts.source]) {
            const temp = nodeDictory[amounts.source].data.value as number[];
            const name2 =
              temp.length > 0
                ? `[${temp.map((_, index) => `${name}_${index}`).join(', ')}]`
                : name;
            dictionary[node.id] = name2;
            return {
              name: name2,
              node,
              inputs,
            };
          } else {
            dictionary[node.id] = name;
            return {
              name,
              node,
              inputs,
            };
          }
        }
        case PTBNodeType.MakeMoveVec:
        case PTBNodeType.MoveCall: {
          const name = `result_${result++}`;
          dictionary[node.id] = name;
          return {
            name,
            node,
            inputs: getInputEdges(node.id),
          };
        }
        default:
          break;
      }
      return { name: '', node, inputs: getInputEdges(node.id) };
    });

  Object.keys(variables).forEach((key) => {
    const temp = variables[key].node;
    const value =
      temp.data.value !== undefined
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
            `const ${name} = ${node.data.code(dictionary, inputs)};`,
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
