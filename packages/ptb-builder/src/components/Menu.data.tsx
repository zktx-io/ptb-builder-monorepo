import React from 'react';

import { IconCircle } from './IconCircle';
import { IconSquare } from './IconSquare';
import { IconTriangle } from './IconTriangle';
import { PTBNodeType } from '../ptbFlow/nodes/types';

export const PTB = {
  Address: {
    Type: PTBNodeType.Address,
    Name: 'address',
  },
  AddressArray: {
    Type: PTBNodeType.AddressArray,
    Name: 'address[]',
  },
  AddressWallet: {
    Type: PTBNodeType.AddressWallet,
    Name: 'wallet',
  },
  Bool: {
    Type: PTBNodeType.Bool,
    Name: 'bool',
  },
  BoolArray: {
    Type: PTBNodeType.BoolArray,
    Name: 'bool[]',
  },
  Number: {
    Type: PTBNodeType.Number,
    Name: 'number',
  },
  NumberArray: {
    Type: PTBNodeType.NumberArray,
    Name: 'number[]',
  },
  NumberVectorU8: {
    Type: PTBNodeType.NumberVector,
    Name: 'vector<u8>',
  },
  NumberVectorU16: {
    Type: PTBNodeType.NumberVector,
    Name: 'vector<u16>',
  },
  NumberVectorU32: {
    Type: PTBNodeType.NumberVector,
    Name: 'vector<u32>',
  },
  NumberVectorU64: {
    Type: PTBNodeType.NumberVector,
    Name: 'vector<u64>',
  },
  NumberVectorU128: {
    Type: PTBNodeType.NumberVector,
    Name: 'vector<u128>',
  },
  NumberVectorU256: {
    Type: PTBNodeType.NumberVector,
    Name: 'vector<u256>',
  },
  ObjectGas: {
    Type: PTBNodeType.ObjectGas,
    Name: 'gas',
  },
  ObjectClock: {
    Type: PTBNodeType.ObjectClock,
    Name: 'clock',
  },
  ObjectDenyList: {
    Type: PTBNodeType.ObjectDenyList,
    Name: 'denyList',
  },
  ObjectRandom: {
    Type: PTBNodeType.ObjectRandom,
    Name: 'random',
  },
  ObjectSystem: {
    Type: PTBNodeType.ObjectSystem,
    Name: 'system',
  },
  ObjectOption: {
    Type: PTBNodeType.ObjectOption,
    Name: 'option',
  },
  Object: {
    Type: PTBNodeType.Object,
    Name: 'object',
  },
  ObjectArray: {
    Type: PTBNodeType.ObjectArray,
    Name: 'object[]',
  },
  String: {
    Type: PTBNodeType.String,
    Name: 'string',
  },
  StringArray: {
    Type: PTBNodeType.StringArray,
    Name: 'string[]',
  },
  StringArray0x2suiSUI: {
    Type: PTBNodeType.StringArray0x2suiSUI,
    Name: '0x2::sui::SUI',
  },

  MakeMoveVec: {
    Type: PTBNodeType.MakeMoveVec,
    Name: 'makeMoveVec',
  },
  MergeCoins: {
    Type: PTBNodeType.MergeCoins,
    Name: 'mergeCoins',
  },
  SplitCoins: {
    Type: PTBNodeType.SplitCoins,
    Name: 'splitCoins',
  },
  TransferObjects: {
    Type: PTBNodeType.TransferObjects,
    Name: 'transferObjects',
  },
  CoinWithBalance: {
    Type: PTBNodeType.CoinWithBalance,
    Name: 'coinWithBalance',
  },
  MoveCall: {
    Type: PTBNodeType.MoveCall,
    Name: 'moveCall',
  },
  Publish: {
    Type: PTBNodeType.Publish,
    Name: 'publish',
  },
  Upgrade: {
    Type: PTBNodeType.Upgrade,
    Name: 'upgrade',
  },

  Start: {
    Type: PTBNodeType.Start,
    Name: 'Start',
  },
  End: {
    Type: PTBNodeType.End,
    Name: 'End',
  },
};

export interface MenuItem {
  name: string;
  type: PTBNodeType | 'DeleteNode' | 'DeleteEdge';
  icon?: React.ReactNode;
}

export const Menu: {
  inputs: {
    name: string;
    submenu: MenuItem[];
  }[];
  commands: MenuItem[];
  node: MenuItem[];
  edge: MenuItem[];
} = {
  inputs: [
    {
      name: 'Address',
      submenu: [
        {
          name: PTB.AddressWallet.Name,
          type: PTB.AddressWallet.Type,
          icon: <IconCircle color="bg-yellow-500" />,
        },
        {
          name: PTB.Address.Name,
          type: PTB.Address.Type,
          icon: <IconCircle color="bg-yellow-500" />,
        },
        {
          name: PTB.AddressArray.Name,
          type: PTB.AddressArray.Type,
          icon: <IconSquare color="bg-yellow-500" />,
        },
      ],
    },
    {
      name: 'Object',
      submenu: [
        {
          name: PTB.Object.Name,
          type: PTB.Object.Type,
          icon: <IconCircle color="bg-blue-500" />,
        },
        {
          name: PTB.ObjectArray.Name,
          type: PTB.ObjectArray.Type,
          icon: <IconSquare color="bg-blue-500" />,
        },
        {
          name: PTB.ObjectGas.Name,
          type: PTB.ObjectGas.Type,
          icon: <IconCircle color="bg-blue-500" />,
        },
      ],
    },
    {
      name: 'Boolean',
      submenu: [
        {
          name: PTB.Bool.Name,
          type: PTB.Bool.Type,
          icon: <IconCircle color="bg-pink-500" />,
        },
        {
          name: PTB.BoolArray.Name,
          type: PTB.BoolArray.Type,
          icon: <IconSquare color="bg-pink-500" />,
        },
      ],
    },
    {
      name: 'String',
      submenu: [
        {
          name: PTB.String.Name,
          type: PTB.String.Type,
          icon: <IconCircle color="bg-green-500" />,
        },
        {
          name: PTB.StringArray.Name,
          type: PTB.StringArray.Type,
          icon: <IconSquare color="bg-green-500" />,
        },
        {
          name: PTB.StringArray0x2suiSUI.Name,
          type: PTB.StringArray0x2suiSUI.Type,
          icon: <IconCircle color="bg-green-500" />,
        },
      ],
    },
    {
      name: 'Number',
      submenu: [
        {
          name: PTB.Number.Name,
          type: PTB.Number.Type,
          icon: <IconCircle color="bg-red-500" />,
        },
        {
          name: PTB.NumberArray.Name,
          type: PTB.NumberArray.Type,
          icon: <IconSquare color="bg-red-500" />,
        },
        {
          name: PTB.NumberVectorU8.Name,
          type: PTB.NumberVectorU8.Type,
          icon: <IconTriangle color="text-red-500" />,
        },
        {
          name: PTB.NumberVectorU16.Name,
          type: PTB.NumberVectorU16.Type,
          icon: <IconTriangle color="text-red-500" />,
        },
        {
          name: PTB.NumberVectorU32.Name,
          type: PTB.NumberVectorU32.Type,
          icon: <IconTriangle color="text-red-500" />,
        },
        {
          name: PTB.NumberVectorU64.Name,
          type: PTB.NumberVectorU64.Type,
          icon: <IconTriangle color="text-red-500" />,
        },
        {
          name: PTB.NumberVectorU128.Name,
          type: PTB.NumberVectorU128.Type,
          icon: <IconTriangle color="text-red-500" />,
        },
        {
          name: PTB.NumberVectorU256.Name,
          type: PTB.NumberVectorU256.Type,
          icon: <IconTriangle color="text-red-500" />,
        },
      ],
    },
    {
      name: 'Helper',
      submenu: [
        {
          name: PTB.ObjectClock.Name,
          type: PTB.ObjectClock.Type,
          icon: <IconCircle color="bg-blue-500" />,
        },
        {
          name: PTB.ObjectDenyList.Name,
          type: PTB.ObjectDenyList.Type,
          icon: <IconCircle color="bg-blue-500" />,
        },
        {
          name: PTB.ObjectRandom.Name,
          type: PTB.ObjectRandom.Type,
          icon: <IconCircle color="bg-blue-500" />,
        },
        {
          name: PTB.ObjectSystem.Name,
          type: PTB.ObjectSystem.Type,
          icon: <IconCircle color="bg-blue-500" />,
        },
        {
          name: PTB.ObjectOption.Name,
          type: PTB.ObjectOption.Type,
          icon: <IconCircle color="bg-blue-500" />,
        },
        {
          name: PTB.CoinWithBalance.Name,
          type: PTB.CoinWithBalance.Type,
          icon: <IconCircle color="bg-blue-500" />,
        },
      ],
    },
  ],
  commands: [
    {
      name: PTB.SplitCoins.Name,
      type: PTB.SplitCoins.Type,
    },
    {
      name: PTB.MergeCoins.Name,
      type: PTB.MergeCoins.Type,
    },
    {
      name: PTB.TransferObjects.Name,
      type: PTB.TransferObjects.Type,
    },
    {
      name: PTB.MakeMoveVec.Name,
      type: PTB.MakeMoveVec.Type,
    },
    {
      name: PTB.MoveCall.Name,
      type: PTB.MoveCall.Type,
    },
  ],
  node: [
    {
      name: 'delete',
      type: 'DeleteNode',
    },
  ],
  edge: [
    {
      name: 'delete',
      type: 'DeleteEdge',
    },
  ],
};
