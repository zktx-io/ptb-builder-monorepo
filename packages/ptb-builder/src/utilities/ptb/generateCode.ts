import { generateFlow } from './generateFlow';
import { PTBEdge, PTBNode, PTBNodeType } from '../../ptbFlow/nodes';

const connvert = (
  id: string,
  dictionary: Record<string, { name: string; results?: string[] }>,
): string => {
  if (!id) {
    return 'undefined';
  }
  if (id.endsWith('[]')) {
    return dictionary[id.replace('[]', '')].name;
  }
  const match = id.match(/\[(\d+)\]$/);
  if (match) {
    return `${dictionary[id.replace(match[0], '')].name}[${match[1]}]`;
  }
  return dictionary[id]
    ? dictionary[id].name
    : dictionary[id.replace('[]', '')]
      ? dictionary[id.replace('[]', '')].name
      : 'undefined';
};

const convert2 = (node: PTBNode, value: string | string[]): string => {
  switch (node.type) {
    case PTBNodeType.AddressWallet:
    case PTBNodeType.ObjectClock:
    case PTBNodeType.ObjectGas:
    case PTBNodeType.ObjectRandom:
    case PTBNodeType.ObjectSystem:
    case PTBNodeType.Bool:
    case PTBNodeType.Number:
      return value as string;
    case PTBNodeType.String:
    case PTBNodeType.Address:
      return `'${value}'`;
    case PTBNodeType.Object:
      return `tx.object('${value}')`;
    case PTBNodeType.BoolArray:
    case PTBNodeType.NumberArray:
      return `[${(value as string[]).join(', ')}]`;
    case PTBNodeType.AddressArray:
    case PTBNodeType.StringArray:
      return `[${(value as string[]).map((item) => `'${item}'`).join(', ')}]`;
    case PTBNodeType.ObjectArray:
      return `[${(value as string[]).map((item) => `tx.object('${item}')`).join(', ')}]`;
    case PTBNodeType.ObjectOption:
      return `tx.object.option({ type: '${value[0]}', value: '${value[1]}' })`;
    case PTBNodeType.CoinWithBalance:
      return `coinWithBalance({\n\tbalance: ${value[2]}${value[1] ? `,\n\ttype: '${value[1]}'` : ''}${value[0] === 'false' ? `,\nuseGasCoin: ${value[0]}` : ''}\n})`;
    case PTBNodeType.BoolVector:
      return `tx.pure.vector('bool', [${(value as string[]).join(',')}])`;
    case PTBNodeType.AddressVector:
      return `tx.pure.vector('address', [${(value as string[]).map((item) => `'${item}'`).join(',')}])`;
    case PTBNodeType.StringVector:
      return `tx.pure.vector('string', [${(value as string[]).map((item) => `'${item}'`).join(',')}])`;
    case PTBNodeType.ObjectVector:
      return `tx.pure.vector('id', [${(value as string[]).map((item) => `'${item}'`).join(',')}])`;
    case PTBNodeType.NumberVector:
      return `tx.pure.vector('${node.data.label.replace('vector<', '').replace('>', '')}', [${(value as string[]).join(',')}])`;
    default:
      break;
  }
  if (Array.isArray(value)) {
    return `[${value.map((v) => `${v}`).join(', ')}]`;
  }
  return `${value}`;
};

const genereateCommand = (
  node: PTBNode,
  inputs: [string, ...Array<string[]>],
  dictionary: Record<string, { name: string; results?: string[] }>,
): string => {
  switch (node.type) {
    case PTBNodeType.SplitCoins:
      if (inputs[1].length === 1) {
        if (inputs[1][0].endsWith('[]')) {
          return `tx.splitCoins([${connvert(inputs[0], dictionary)}], ${connvert(inputs[1][0], dictionary)})`;
        }
        return `tx.splitCoins(${connvert(inputs[0], dictionary)}, [${connvert(inputs[1][0], dictionary)}])`;
      } else {
        return `tx.splitCoins(${connvert(inputs[0], dictionary)}, [${inputs[1].map((v) => connvert(v, dictionary)).join(', ')}])`;
      }
    case PTBNodeType.MergeCoins:
      if (inputs[1].length === 1) {
        if (inputs[1][0].endsWith('[]')) {
          return `tx.mergeCoins([${connvert(inputs[0], dictionary)}], ${connvert(inputs[1][0], dictionary)})`;
        }
        return `tx.mergeCoins(${connvert(inputs[0], dictionary)}, [${connvert(inputs[1][0], dictionary)}])`;
      } else {
        return `tx.mergeCoins(${connvert(inputs[0], dictionary)}, [${inputs[1].map((v) => connvert(v, dictionary)).join(', ')}])`;
      }
    case PTBNodeType.TransferObjects:
      if (inputs[1].length === 1) {
        if (inputs[1][0].endsWith('[]')) {
          return `tx.transferObjects(${connvert(inputs[1][0], dictionary)}, ${connvert(inputs[0], dictionary)})`;
        }
        return `tx.transferObjects([${connvert(inputs[1][0], dictionary)}], ${connvert(inputs[0], dictionary)})`;
      } else {
        return `tx.transferObjects([${inputs[1].map((v) => connvert(v, dictionary)).join(', ')}], ${connvert(inputs[0], dictionary)})`;
      }
    case PTBNodeType.MakeMoveVec:
      return `tx.makeMoveVec({\n\ttype: '${inputs[0]}',\n\telements: [${inputs[1].map((v) => connvert(v, dictionary)).join(', ')}],\n})`;
    case PTBNodeType.MoveCall: {
      const target = !!inputs[0] ? `'${inputs[0]}'` : 'undefined';
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
        line: "// import { coinWithBalance, Transaction } from '@mysten/sui/transactions';",
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
      { line: 'const GAS_BUDGET = 0.5 * 500000000;', comment: '' },
      { line: 'const tx = new Transaction();', comment: '' },
      { line: '', comment: '' },
    ];

    const addCodeLine = (line: string, comment: string) => {
      lines.push({ line, comment });
    };

    let varIndex = 1;
    let cmdIndex = 1;
    const dictionary: Record<string, { name: string; sources?: string[] }> = {};
    Object.keys(inputs).forEach((key) => {
      const { value } = inputs[key].data;
      const name = `val_${varIndex++}`;
      dictionary[key] = { name };
      addCodeLine(
        `const ${name} = ${value === undefined ? 'undefined' : convert2(inputs[key], value)};`,
        '',
      );
    });
    commands.forEach(({ node, targets, sources }) => {
      if (sources) {
        const name = `cmd_${cmdIndex++}`;
        dictionary[node.id] = { name, sources };
        addCodeLine(
          `const ${name} = ${genereateCommand(node, targets, dictionary)}`,
          '',
        );
      } else {
        addCodeLine(`${genereateCommand(node, targets, dictionary)}`, '');
      }
    });
    addCodeLine('', '');
    addCodeLine('tx.setGasBudgetIfNotSet(GAS_BUDGET)', '');
    addCodeLine('tx.setSenderIfNotSet(myAddress)', '');
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
