import {
  coinWithBalance,
  Transaction,
  TransactionArgument,
  TransactionObjectArgument,
  TransactionResult,
} from '@mysten/sui/transactions';

import { generateFlow } from './generateFlow';
import { readPackageData } from '../../provider';
import { PTBEdge, PTBNode, PTBNodeType } from '../../ptbFlow/nodes';

const GAS_BUDGET = 0.5 * 500000000;

interface Result {
  $kind: 'Result';
  Result: number;
}

interface NestedResult {
  $kind: 'NestedResult';
  NestedResult: [number, number];
}

type DictionaryItem =
  | number
  | string
  | TransactionObjectArgument
  | Result
  | NestedResult
  | ((tx: Transaction) => TransactionResult);

const connvert = (
  id: string,
  dictionary: Record<string, undefined | DictionaryItem | DictionaryItem[]>,
): undefined | DictionaryItem | DictionaryItem[] => {
  if (!id) {
    return undefined;
  }
  const match = id.match(/\[(\d+)\]$/);
  if (match) {
    const data = dictionary[id.replace(`${match[0]}`, '')];
    if (data && Array.isArray(data)) {
      return data[parseInt(match[1], 10)];
    }
    return undefined;
  }
  return dictionary[id];
};

const genereateCommand = (
  node: PTBNode,
  inputs: [string, ...Array<string[]>],
  dictionary: Record<string, undefined | DictionaryItem | DictionaryItem[]>,
  tx: Transaction,
  results?: string[],
): {
  tx: Transaction;
  nestedResults?: Result | NestedResult[];
} => {
  try {
    switch (node.type) {
      case PTBNodeType.SplitCoins: {
        const coin = connvert(inputs[0], dictionary);
        let amounts;
        if (inputs[1].length === 1 && !inputs[1][0].endsWith(']')) {
          amounts = [connvert(inputs[1][0], dictionary)];
        } else {
          amounts = inputs[1].map((v) => connvert(v, dictionary));
        }
        const result = tx.splitCoins(
          coin as TransactionObjectArgument,
          amounts as number[],
        );
        return {
          tx,
          nestedResults: (amounts as any[]).map(
            (_, i) => result[i] as NestedResult,
          ),
        };
      }
      case PTBNodeType.MergeCoins: {
        const destination = connvert(inputs[0], dictionary);
        let sources;
        if (inputs[1].length === 1) {
          if (inputs[1][0].endsWith('[]')) {
            sources = connvert(inputs[1][0], dictionary);
          } else {
            sources = [connvert(inputs[1][0], dictionary)];
          }
        } else {
          sources = inputs[1].map((v) => connvert(v, dictionary));
        }
        tx.mergeCoins(
          destination as TransactionObjectArgument,
          sources as TransactionObjectArgument[],
        );
        return { tx };
      }
      case PTBNodeType.TransferObjects: {
        const address = connvert(inputs[0], dictionary);
        let objects;
        if (inputs[1].length === 1) {
          if (inputs[1][0].endsWith('[]')) {
            objects = connvert(inputs[1][0], dictionary);
          } else {
            objects = [connvert(inputs[1][0], dictionary)];
          }
        } else {
          objects = inputs[1].map((v) => connvert(v, dictionary));
        }
        tx.transferObjects(
          objects as TransactionObjectArgument[],
          address as TransactionObjectArgument,
        );
        return { tx };
      }
      case PTBNodeType.MakeMoveVec: {
        const type = inputs[0];
        const elements = inputs[1].map((v) => connvert(v, dictionary));
        const result = tx.makeMoveVec({
          type: type,
          elements: elements.map((v) => {
            switch (type) {
              case 'address':
                return tx.pure.address(v as string);
              case 'string':
                return tx.pure.string(v as string);
              case 'u8':
                return tx.pure.u8(v as number);
              case 'u16':
                return tx.pure.u16(v as number);
              case 'u32':
                return tx.pure.u32(v as number);
              case 'u64':
                return tx.pure.u64(v as number);
              case 'u128':
                return tx.pure.u128(v as number);
              case 'u256':
                return tx.pure.u256(v as number);
              case 'object':
                return tx.object(`${v}`);
              case 'bool':
                return tx.pure.bool(v === 'true');
              default:
                return `${v}`;
            }
          }),
        });
        return { tx, nestedResults: result };
      }
      case PTBNodeType.MoveCall: {
        const moduleData = node.data.moveCall
          ? node.data.moveCall.package
            ? readPackageData(node.data.moveCall.package)
            : undefined
          : undefined;
        const types =
          moduleData?.modules[node.data.moveCall?.module!].exposedFunctions[
            node.data.moveCall?.function!
          ].parameters;
        const target = inputs[0] !== undefined ? inputs[0] : undefined;
        const typeArguments =
          inputs[1] && inputs[1].length > 0
            ? inputs[1].map((v) => connvert(v, dictionary) as string)
            : undefined;
        const argument =
          inputs[2] && inputs[2].length > 0
            ? inputs[2].map((v, i) => {
                const temp = connvert(v, dictionary);
                if (typeof temp === 'number' && types && types[i]) {
                  switch (types[i]) {
                    case 'U8':
                      return tx.pure.u8(temp);
                    case 'U16':
                      return tx.pure.u16(temp);
                    case 'U32':
                      return tx.pure.u32(temp);
                    case 'U64':
                      return tx.pure.u64(temp);
                    case 'U128':
                      return tx.pure.u128(temp);
                    case 'U256':
                      return tx.pure.u256(temp);
                  }
                }
                return temp as TransactionArgument;
              })
            : undefined;
        if (target) {
          const result = tx.moveCall({
            target,
            ...(argument && { arguments: argument }),
            ...(typeArguments && { typeArguments: typeArguments }),
          });
          return {
            tx,
            nestedResults: results
              ? results.length > 1
                ? (results as any[]).map((_, i) => result[i] as NestedResult)
                : result
              : undefined,
          };
        }
        throw `Invalid parameters for ${node.type}`;
      }
      case PTBNodeType.Publish:
      case PTBNodeType.Upgrade:
      default:
        throw `Invalid command type: ${node.type}`;
    }
  } catch (error) {
    throw `${error} (${node.type})`;
  }
};

export const generateTxb = async (
  nodes: PTBNode[],
  edges: PTBEdge[],
  wallet?: string,
): Promise<Transaction> => {
  try {
    const { inputs, commands } = generateFlow(nodes, edges);
    let tx = new Transaction();

    const dictionary: Record<
      string,
      undefined | DictionaryItem | DictionaryItem[]
    > = {};
    Object.keys(inputs).forEach((key) => {
      const { value, label } = inputs[key].data;
      switch (inputs[key].type) {
        case PTBNodeType.Address:
          dictionary[key] = tx.pure.address(value as string);
          break;
        case PTBNodeType.AddressWallet:
          if (wallet) {
            dictionary[key] = tx.pure.address(wallet);
          } else {
            throw new Error('Wallet is required');
          }
          break;
        case PTBNodeType.AddressArray:
          dictionary[key] = (value as string[]).map((v) =>
            tx.pure.address(value as string),
          );
          break;
        case PTBNodeType.AddressVector:
          dictionary[key] = tx.pure.vector('address', value as string[]);
          break;
        case PTBNodeType.Bool:
          dictionary[key] = tx.pure.bool(value === 'true');
          break;
        case PTBNodeType.BoolArray:
          dictionary[key] = (value as string[]).map((v) =>
            tx.pure.bool(value === 'true'),
          );
          break;
        case PTBNodeType.BoolVector:
          dictionary[key] = tx.pure.vector(
            'bool',
            (value as string[]).map((v) => v === 'true'),
          );
          break;
        case PTBNodeType.String:
        case PTBNodeType.String0x2suiSUI:
          dictionary[key] = value as string;
          break;
        case PTBNodeType.StringVector:
          dictionary[key] = tx.pure.vector('string', value as string[]);
          break;
        case PTBNodeType.Number:
          dictionary[key] = value as number;
          break;
        case PTBNodeType.NumberArray:
          dictionary[key] = (value as number[]).map((v) => v);
          break;
        case PTBNodeType.NumberVector:
          dictionary[key] = tx.pure.vector(
            label.replace('vector<', '').replace('>', '') as any,
            value as number[],
          );
          break;
        case PTBNodeType.Object:
          dictionary[key] = tx.object(value as string);
          break;
        case PTBNodeType.ObjectArray:
          dictionary[key] = (value as string[]).map((v) =>
            tx.object(value as string),
          );
          break;
        case PTBNodeType.ObjectVector:
          dictionary[key] = tx.pure.vector('id', value as string[]);
          break;
        case PTBNodeType.ObjectClock:
          dictionary[key] = tx.object.clock();
          break;
        case PTBNodeType.ObjectDenyList:
          dictionary[key] = tx.object.denyList();
          break;
        case PTBNodeType.ObjectGas:
          dictionary[key] = tx.gas;
          break;
        case PTBNodeType.ObjectRandom:
          dictionary[key] = tx.object.random();
          break;
        case PTBNodeType.ObjectSystem:
          dictionary[key] = tx.object.system();
          break;
        case PTBNodeType.ObjectOption:
          {
            const temp = inputs[key].data.value;
            if (temp && Array.isArray(temp)) {
              dictionary[key] = tx.object.option({
                type: temp[0] as string,
                value: temp[1] as string,
              });
            }
          }
          break;
        case PTBNodeType.CoinWithBalance:
          {
            const temp = inputs[key].data.value;
            if (temp && Array.isArray(temp)) {
              dictionary[key] = coinWithBalance({
                ...(temp[0] !== 'true' && { useGasCoin: false }),
                ...(temp[1] && { type: temp[1] as string }),
                balance: parseInt(temp[2] as string),
              });
            }
          }
          break;
        default:
          break;
      }
    });

    commands.forEach(({ node, targets, sources }) => {
      const { tx: tx2, nestedResults } = genereateCommand(
        node,
        targets,
        dictionary,
        tx,
        sources,
      );
      tx = tx2;
      dictionary[node.id] = nestedResults;
    });

    tx.setGasBudgetIfNotSet(GAS_BUDGET);
    wallet && tx.setSenderIfNotSet(wallet);

    return tx;
  } catch (error) {
    throw error;
  }
};
