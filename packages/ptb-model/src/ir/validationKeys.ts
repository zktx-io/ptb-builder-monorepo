import type { IRArgRef, IRCommand, IRInput } from './types.js';

export const TRANSACTION_IR_KEYS = [
  'version',
  'inputs',
  'commands',
  'diagnostics',
] as const;

export const IR_INPUT_KEYS_BY_KIND = {
  Pure: ['id', 'kind', 'bytes', 'value', 'type', 'canonicalRaw'],
  Object: ['id', 'kind', 'source', 'type', 'canonicalRaw'],
  FundsWithdrawal: ['id', 'kind', 'value', 'canonicalRaw'],
  Unsupported: ['id', 'kind', 'sourceKind', 'value'],
} as const satisfies Record<IRInput['kind'], readonly string[]>;

export const IR_OBJECT_SOURCE_KEYS_BY_KIND = {
  Unresolved: ['kind', 'objectId'],
  Resolved: ['kind', 'object'],
} as const;

export const IR_COMMAND_KEYS_BY_KIND = {
  MoveCall: [
    'id',
    'kind',
    'package',
    'module',
    'function',
    'typeArguments',
    'arguments',
    '_argumentTypes',
    'resultCount',
    'canonicalRaw',
  ],
  TransferObjects: [
    'id',
    'kind',
    'objects',
    'address',
    'resultCount',
    'canonicalRaw',
  ],
  SplitCoins: ['id', 'kind', 'coin', 'amounts', 'resultCount', 'canonicalRaw'],
  MergeCoins: [
    'id',
    'kind',
    'destination',
    'sources',
    'resultCount',
    'canonicalRaw',
  ],
  Publish: [
    'id',
    'kind',
    'modules',
    'dependencies',
    'resultCount',
    'canonicalRaw',
  ],
  MakeMoveVec: [
    'id',
    'kind',
    'type',
    'elements',
    'resultCount',
    'canonicalRaw',
  ],
  Upgrade: [
    'id',
    'kind',
    'modules',
    'dependencies',
    'package',
    'ticket',
    'resultCount',
    'canonicalRaw',
  ],
  Unsupported: ['id', 'kind', 'sourceKind', 'value', 'resultCount'],
} as const satisfies Record<IRCommand['kind'], readonly string[]>;

export const IR_ARG_REF_KEYS_BY_KIND = {
  GasCoin: ['kind'],
  Input: ['kind', 'index', 'type'],
  Result: ['kind', 'commandIndex'],
  NestedResult: ['kind', 'commandIndex', 'resultIndex'],
} as const satisfies Record<IRArgRef['kind'], readonly string[]>;
