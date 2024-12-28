import { generateFlow } from './generateFlow';
import { PTBEdge, PTBNode, PTBNodeType } from '../../ptbFlow/nodes';

const connvert = (
  id: string | undefined,
  dictionary: Record<string, string>,
): string => {
  if (id === undefined) {
    return 'undefined';
  }
  const match = id.match(/\[(\d+)\]$/);
  if (match) {
    const index = match[1];
    return `${dictionary[id.replace(`[${index}]`, '')]}[${index}]`;
  }
  return dictionary[id];
};

const convert2 = (type: PTBNodeType, value: string | string[]): string => {
  switch (type) {
    case PTBNodeType.AddressWallet:
    case PTBNodeType.ObjectClock:
    case PTBNodeType.ObjectGas:
    case PTBNodeType.ObjectRandom:
    case PTBNodeType.ObjectSystem:
      return value as string;
    case PTBNodeType.ObjectOption:
      return `tx.object.option({ type: '${value[0]}', value: '${value[1]}' })`;
    default:
      break;
  }
  return `'${value}'`;
};

const genereateCommand = (
  node: PTBNode,
  inputs: [string | undefined, ...Array<(string | undefined)[]>],
  dictionary: Record<string, string>,
): string => {
  switch (node.type) {
    case PTBNodeType.SplitCoins:
      return `tx.splitCoins(${connvert(inputs[0], dictionary)}, [${inputs[1].map((v) => connvert(v, dictionary)).join(', ')}])`;
    case PTBNodeType.MergeCoins:
      return `tx.mergeCoins(${connvert(inputs[0], dictionary)}, [${inputs[1].map((v) => connvert(v, dictionary)).join(', ')}])`;
    case PTBNodeType.TransferObjects:
      return `tx.transferObjects([${inputs[1].map((v) => connvert(v, dictionary)).join(', ')}], ${connvert(inputs[0], dictionary)})`;
    case PTBNodeType.MakeMoveVec:
      return `tx.makeMoveVec({\n\ttype: '${inputs[0]}',\n\telements: [${inputs[1].map((v) => connvert(v, dictionary)).join(', ')}],\n})`;
    case PTBNodeType.MoveCall: {
      const target = inputs[0] !== undefined ? inputs[0] : 'undefined';
      const typeparams = inputs[1]
        ?.map((v) => connvert(v, dictionary))
        .join(', ');
      const params = inputs[2]?.map((v) => connvert(v, dictionary)).join(', ');
      const moveCallArgs = {
        target,
        ...(params && { arguments: `[${params}]` }),
        ...(typeparams && { typeArguments: `[${typeparams}]` }),
      };
      const formattedArgs = Object.entries(moveCallArgs)
        .map(([key, value]) => `\t${key}: ${value}`)
        .join(',\n');
      return `tx.moveCall({\n${formattedArgs},\n})`;
    }
    case PTBNodeType.Publish:
    case PTBNodeType.Upgrade:
    default:
      return '';
  }
};

export const generateCode = (nodes: PTBNode[], edges: PTBEdge[]): string => {
  try {
    const { inputs, commands } = generateFlow(nodes, edges);

    if (
      Object.keys(commands).length === 0 &&
      Object.keys(inputs).length === 0
    ) {
      return '';
    }

    const lines: { line: string; comment: string }[] = [
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
        line: 'const wallet = new Ed25519Keypair();',
        comment: '',
      },
      {
        line: 'const myAddress = wallet.getPublicKey().toSuiAddress();',
        comment: '',
      },
      { line: 'const tx = new Transaction();', comment: '' },
      { line: '', comment: '' },
    ];

    const addCodeLine = (line: string, comment: string) => {
      lines.push({ line, comment });
    };

    let varIndex = 1;
    let cmdIndex = 1;
    const dictionary: Record<string, string> = {};
    Object.keys(inputs).forEach((key) => {
      const { value } = inputs[key].data;
      const name = `val_${varIndex++}`;
      dictionary[key] = name;
      addCodeLine(
        `const ${name} = ${
          value !== undefined
            ? Array.isArray(value) &&
              inputs[key].type !== PTBNodeType.ObjectOption
              ? `[${value.map((v) => (typeof v === 'string' ? convert2(inputs[key].type as PTBNodeType, v) : v)).join(', ')}]`
              : typeof value === 'string' ||
                  inputs[key].type === PTBNodeType.ObjectOption
                ? convert2(
                    inputs[key].type as PTBNodeType,
                    value as string | string[],
                  )
                : value
            : 'undefined'
        };`,
        '',
      );
    });
    commands.forEach(({ node, inputs, results }) => {
      if (results) {
        const name = `cmd_${cmdIndex++}`;
        dictionary[node.id] = name;
        addCodeLine(
          `const ${name} = ${genereateCommand(node, inputs, dictionary)}`,
          '',
        );
      } else {
        addCodeLine(`${genereateCommand(node, inputs, dictionary)}`, '');
      }
    });

    addCodeLine('', '');
    addCodeLine('wallet.signTransaction({ transaction: tx });', '');

    const paddingSize = 40;
    const formattedCode =
      lines.length > 2
        ? lines
            .map(
              ({ line, comment }) =>
                `${line.padEnd(paddingSize)}${comment ? ` // ${comment}` : ''}`,
            )
            .join('\n')
        : '';

    return formattedCode;
  } catch (error) {
    return `${error}`;
  }
};
