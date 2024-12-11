import React from 'react';

import { IconCircle } from './IconCircle';
import { IconSquare } from './IconSquare';
import { IconTriangle } from './IconTriangle';
import { PTBNodeType } from '../PTBFlow/nodes/types';

export const PTB = {
  Address: {
    Type: PTBNodeType.Address,
    Name: 'address',
  },
  AddressArray: {
    Type: PTBNodeType.AddressArray,
    Name: 'address[]',
  },
  AddressVector: {
    Type: PTBNodeType.AddressVector,
    Name: 'vector<address>',
  },
  Bool: {
    Type: PTBNodeType.Bool,
    Name: 'bool',
  },
  BoolArray: {
    Type: PTBNodeType.BoolArray,
    Name: 'bool[]',
  },
  BoolVector: {
    Type: PTBNodeType.BoolVector,
    Name: 'vector<bool>',
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
  Object: {
    Type: PTBNodeType.Object,
    Name: 'object',
  },
  ObjectArray: {
    Type: PTBNodeType.ObjectArray,
    Name: 'object[]',
  },
  ObjectVector: {
    Type: PTBNodeType.ObjectVector,
    Name: 'vector<object>',
  },
  String: {
    Type: PTBNodeType.String,
    Name: 'string',
  },
  MakeMoveVecAddress: {
    Type: PTBNodeType.MakeMoveVec,
    Name: 'vector<address>',
  },
  MakeMoveVecBool: {
    Type: PTBNodeType.MakeMoveVec,
    Name: 'vector<bool>',
  },
  MakeMoveVecObject: {
    Type: PTBNodeType.MakeMoveVec,
    Name: 'vector<object>',
  },
  MakeMoveVecString: {
    Type: PTBNodeType.MakeMoveVec,
    Name: 'vector<string>',
  },
  MakeMoveVecU8: {
    Type: PTBNodeType.MakeMoveVec,
    Name: 'vector<u8>',
  },
  MakeMoveVecU16: {
    Type: PTBNodeType.MakeMoveVec,
    Name: 'vector<u16>',
  },
  MakeMoveVecU32: {
    Type: PTBNodeType.MakeMoveVec,
    Name: 'vector<u32>',
  },
  MakeMoveVecU64: {
    Type: PTBNodeType.MakeMoveVec,
    Name: 'vector<u64>',
  },
  MakeMoveVecU128: {
    Type: PTBNodeType.MakeMoveVec,
    Name: 'vector<u128>',
  },
  MakeMoveVecU256: {
    Type: PTBNodeType.MakeMoveVec,
    Name: 'vector<u256>',
  },
  MergeCoins: {
    Type: PTBNodeType.MergeCoins,
    Name: 'merge coins',
  },
  SplitCoins: {
    Type: PTBNodeType.SplitCoins,
    Name: 'split coins',
  },
  TransferObjects: {
    Type: PTBNodeType.TransferObjects,
    Name: 'transfer objects',
  },
  MoveCall: {
    Type: PTBNodeType.MoveCall,
    Name: 'move call',
  },
  Publish: {
    Type: PTBNodeType.Publish,
    Name: 'publish',
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
  utilities: {
    name: string;
    submenu: MenuItem[];
  }[];
  transactions: MenuItem[];
  node: MenuItem[];
  edge: MenuItem[];
} = {
  inputs: [
    {
      name: 'Address',
      submenu: [
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
        {
          name: PTB.AddressVector.Name,
          type: PTB.AddressVector.Type,
          icon: <IconTriangle color="text-yellow-500" />,
        },
      ],
    },
    {
      name: 'Object',
      submenu: [
        {
          name: PTB.ObjectGas.Name,
          type: PTB.ObjectGas.Type,
          icon: <IconCircle color="bg-blue-500" />,
        },
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
          name: PTB.ObjectVector.Name,
          type: PTB.ObjectVector.Type,
          icon: <IconTriangle color="text-blue-500" />,
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
        {
          name: PTB.BoolVector.Name,
          type: PTB.BoolVector.Type,
          icon: <IconTriangle color="text-pink-500" />,
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
  ],
  utilities: [
    {
      name: 'make move vec',
      submenu: [
        {
          name: PTB.MakeMoveVecAddress.Name,
          type: PTB.MakeMoveVecAddress.Type,
          icon: <IconTriangle color="text-yellow-500" />,
        },
        {
          name: PTB.MakeMoveVecBool.Name,
          type: PTB.MakeMoveVecBool.Type,
          icon: <IconTriangle color="text-pink-500" />,
        },
        {
          name: PTB.MakeMoveVecObject.Name,
          type: PTB.MakeMoveVecObject.Type,
          icon: <IconTriangle color="text-blue-500" />,
        },
        {
          name: PTB.MakeMoveVecString.Name,
          type: PTB.MakeMoveVecString.Type,
          icon: <IconTriangle color="text-green-500" />,
        },
        {
          name: PTB.MakeMoveVecU8.Name,
          type: PTB.MakeMoveVecU8.Type,
          icon: <IconTriangle color="text-red-500" />,
        },
        {
          name: PTB.MakeMoveVecU16.Name,
          type: PTB.MakeMoveVecU16.Type,
          icon: <IconTriangle color="text-red-500" />,
        },
        {
          name: PTB.MakeMoveVecU32.Name,
          type: PTB.MakeMoveVecU32.Type,
          icon: <IconTriangle color="text-red-500" />,
        },
        {
          name: PTB.MakeMoveVecU64.Name,
          type: PTB.MakeMoveVecU64.Type,
          icon: <IconTriangle color="text-red-500" />,
        },
        {
          name: PTB.MakeMoveVecU128.Name,
          type: PTB.MakeMoveVecU128.Type,
          icon: <IconTriangle color="text-red-500" />,
        },
        {
          name: PTB.MakeMoveVecU256.Name,
          type: PTB.MakeMoveVecU256.Type,
          icon: <IconTriangle color="text-red-500" />,
        },
      ],
    },
  ],
  transactions: [
    {
      name: PTB.MergeCoins.Name,
      type: PTB.MergeCoins.Type,
    },
    {
      name: PTB.SplitCoins.Name,
      type: PTB.SplitCoins.Type,
    },
    {
      name: PTB.TransferObjects.Name,
      type: PTB.TransferObjects.Type,
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
