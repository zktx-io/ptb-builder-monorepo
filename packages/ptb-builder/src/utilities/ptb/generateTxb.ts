import {
  Transaction,
  TransactionArgument,
  TransactionObjectArgument,
  TransactionResult,
} from '@mysten/sui/transactions';

import { generateFlow } from './generateFlow';
import { PTBEdge, PTBNode, PTBNodeType } from '../../ptbFlow/nodes';

type DictionaryItem =
  | number
  | string
  | TransactionObjectArgument
  | TransactionResult;

interface NestedResult {
  $kind: 'NestedResult';
  NestedResult: [number, number];
}

const connvert = (
  id: string | undefined,
  dictionary: Record<string, undefined | DictionaryItem | DictionaryItem[]>,
): undefined | DictionaryItem | DictionaryItem[] => {
  if (id === undefined) {
    return undefined;
  }
  const match = id.match(/\[(\d+)\]$/);
  if (match) {
    const index = match[1];
    const data = dictionary[id.replace(`[${index}]`, '')];
    if (data && Array.isArray(data)) {
      return data[parseInt(index, 10)];
    }
    return undefined;
  }
  return dictionary[id];
};

const genereateCommand = (
  node: PTBNode,
  inputs: (string | undefined)[][],
  dictionary: Record<string, undefined | DictionaryItem | DictionaryItem[]>,
  tx: Transaction,
  results?: (string | undefined)[],
): {
  tx: Transaction;
  nestedResults?: TransactionResult | NestedResult[];
} => {
  try {
    switch (node.type) {
      case PTBNodeType.SplitCoins: {
        const coin = inputs[0][0];
        const amounts = inputs[1].map((v) => connvert(v, dictionary));
        if (coin && dictionary[coin]) {
          const result = tx.splitCoins(
            dictionary[coin] as TransactionObjectArgument,
            amounts as number[],
          );
          return {
            tx,
            nestedResults: (amounts as any[]).map(
              (_, i) => result[i] as NestedResult,
            ),
          };
        }
        throw new Error(`Invalid parameters for ${node.type}`);
      }
      case PTBNodeType.MergeCoins: {
        const destination = inputs[0][0];
        const sources = inputs[1].map((v) => connvert(v, dictionary));
        if (destination && dictionary[destination]) {
          tx.mergeCoins(
            dictionary[destination] as TransactionObjectArgument,
            sources as TransactionObjectArgument[],
          );
          return { tx };
        }
        throw new Error(`Invalid parameters for ${node.type}`);
      }
      case PTBNodeType.TransferObjects: {
        const objects = inputs[1].map((v) => connvert(v, dictionary));
        const address = inputs[0][0];
        if (address && dictionary[address]) {
          tx.transferObjects(
            objects as TransactionObjectArgument[],
            dictionary[address] as TransactionObjectArgument,
          );
          return { tx };
        }
        throw new Error(`Invalid parameters for ${node.type}`);
      }
      case PTBNodeType.MakeMoveVec: {
        const type = inputs[0][0];
        const elements = inputs[1].map((v) => connvert(v, dictionary));
        if (type) {
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
        throw new Error(`Invalid parameters for ${node.type}`);
      }
      case PTBNodeType.MoveCall: {
        const target =
          inputs[0][0] !== undefined ? `${inputs[0].join('::')}` : undefined;
        const argument =
          inputs[1] && inputs[1].length > 0
            ? inputs[1].map(
                (v) => connvert(v, dictionary) as TransactionArgument,
              )
            : undefined;
        const typeArguments =
          inputs[2] && inputs[2].length > 0
            ? inputs[2].map((v) => connvert(v, dictionary) as string)
            : undefined;
        if (target) {
          const result = tx.moveCall({
            target,
            ...(argument && { arguments: argument }),
            ...(typeArguments && { typeArguments: typeArguments }),
          });
          return {
            tx,
            nestedResults:
              results &&
              (results as any[]).map((_, i) => result[i] as NestedResult),
          };
        }
        throw new Error(`Invalid parameters for ${node.type}`);
      }
      case PTBNodeType.Publish:
      default:
        throw new Error(`Invalid command type: ${node.type}`);
    }
  } catch (error) {
    throw new Error(`Failed to generate command: ${error}`);
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
      const { value } = inputs[key].data;
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
        case PTBNodeType.Bool:
          dictionary[key] = tx.pure.bool(value === 'true');
          break;
        case PTBNodeType.BoolArray:
          dictionary[key] = (value as string[]).map((v) =>
            tx.pure.bool(value === 'true'),
          );
          break;
        case PTBNodeType.String:
          dictionary[key] = value as string;
          break;
        case PTBNodeType.Number:
          dictionary[key] = value as number;
          break;
        case PTBNodeType.NumberArray:
          dictionary[key] = (value as number[]).map((v) => v);
          break;
        case PTBNodeType.Object:
          dictionary[key] = tx.object(value as string);
          break;
        case PTBNodeType.ObjectArray:
          dictionary[key] = (value as string[]).map((v) =>
            tx.object(value as string),
          );
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
          const temp = inputs[key].data.value;
          if (temp && Array.isArray(temp)) {
            dictionary[key] = tx.object.option({
              type: temp[0] as string,
              value: temp[1] as string,
            })(tx);
          }
          break;
        default:
          break;
      }
    });

    commands.forEach(({ node, inputs, results }) => {
      const { tx: tx2, nestedResults } = genereateCommand(
        node,
        inputs,
        dictionary,
        tx,
        results,
      );
      tx = tx2;
      dictionary[node.id] = nestedResults;
    });

    return tx;
  } catch (error) {
    throw new Error(`${error}`);
  }
};
