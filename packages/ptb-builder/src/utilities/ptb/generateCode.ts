import { generateFlow } from './generateFlow';
import { PTBEdge, PTBNode, PTBNodeType } from '../../ptbFlow/nodes';

const connvert = (
  id: string,
  dictionary: Record<string, { name: string; results?: string[] }>,
): string => {
  if (!id) {
    return 'undefined';
  }
  const match = id.match(/\[(\d+)\]$/);
  if (match) {
    return `${dictionary[id.replace(match[0], '')].name}[${match[1]}]`;
  }
  return dictionary[id] ? dictionary[id].name : 'undefined';
};

const convert2 = (node: PTBNode, value: string | string[]): string => {
  switch (node.type) {
    case PTBNodeType.AddressWallet:
    case PTBNodeType.ObjectClock:
    case PTBNodeType.ObjectGas:
    case PTBNodeType.ObjectRandom:
    case PTBNodeType.ObjectSystem:
      return value as string;
    case PTBNodeType.ObjectOption:
      return `tx.object.option({ type: '${value[0]}', value: '${value[1]}' })`;
    case PTBNodeType.CoinWithBalance:
      return `coinWithBalance({\n\tbalance: ${value[2]}${value[1] ? `,\n\ttype: '${value[1]}'` : ''}${value[0] === 'false' ? `,\nuseGasCoin: ${value[0]}` : ''}\n})`;
    case PTBNodeType.NumberVector:
      return `tx.pure.vector('${node.data.label.replace('vector<', '').replace('>', '')}', [${(value as string[]).join(',')}])`;
    default:
      break;
  }
  return `'${value}'`;
};

const genereateCommand = (
  node: PTBNode,
  inputs: [string, ...Array<string[]>],
  dictionary: Record<string, { name: string; results?: string[] }>,
): string => {
  switch (node.type) {
    case PTBNodeType.SplitCoins:
      if (inputs[1].length === 1 && !inputs[1][0].endsWith(']')) {
        return `tx.splitCoins(${connvert(inputs[0], dictionary)}, [${connvert(inputs[1][0], dictionary)}])`;
      } else {
        return `tx.splitCoins(${connvert(inputs[0], dictionary)}, [${inputs[1].map((v) => connvert(v, dictionary)).join(', ')}])`;
      }
    case PTBNodeType.MergeCoins:
      if (inputs[1].length === 1 && !inputs[1][0].endsWith(']')) {
        return `tx.mergeCoins(${connvert(inputs[0], dictionary)}, [${connvert(inputs[1][0], dictionary)}])`;
      } else {
        return `tx.mergeCoins(${connvert(inputs[0], dictionary)}, [${inputs[1].map((v) => connvert(v, dictionary)).join(', ')}])`;
      }
    case PTBNodeType.TransferObjects:
      if (inputs[1].length === 1 && !inputs[1][0].endsWith(']')) {
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
        `const ${name} = ${
          value !== undefined
            ? Array.isArray(value) &&
              inputs[key].type !== PTBNodeType.ObjectOption &&
              inputs[key].type !== PTBNodeType.CoinWithBalance &&
              inputs[key].type !== PTBNodeType.NumberVector
              ? `[${value.map((v) => (typeof v === 'string' ? convert2(inputs[key], v) : v)).join(', ')}]`
              : typeof value === 'string' ||
                  inputs[key].type === PTBNodeType.ObjectOption ||
                  inputs[key].type === PTBNodeType.CoinWithBalance ||
                  inputs[key].type === PTBNodeType.NumberVector
                ? convert2(inputs[key], value as string | string[])
                : value
            : 'undefined'
        };`,
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
