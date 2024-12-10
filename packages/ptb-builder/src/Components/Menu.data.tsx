import React from 'react';

import { IconCircle } from './IconCircle';
import { IconSquare } from './IconSquare';
import { IconTriangle } from './IconTriangle';

export enum PTBNodeType {
  SuiAddress = 'SuiAddress',
  SuiAddressArray = 'SuiAddressArray',
  SuiAddressVector = 'SuiAddressVector',

  SuiBool = 'SuiBool',
  SuiBoolArray = 'SuiBoolArray',
  SuiBoolVector = 'SuiBoolVector',

  SuiNumber = 'SuiNumber',
  SuiNumberArray = 'SuiNumberArray',
  SuiNumberVector = 'SuiNumberVector',

  SuiObjectGas = 'SuiObjectGas',
  SuiObject = 'SuiObject',
  SuiObjectArray = 'SuiObjectArray',
  SuiObjectVector = 'SuiObjectVector',

  SuiString = 'SuiString',

  MergeCoins = 'MergeCoins',
  SplitCoins = 'SplitCoins',
  TransferObjects = 'TransferObjects',
  MoveCall = 'MoveCall',
}

export const PTB = {
  Address: {
    Type: PTBNodeType.SuiAddress,
    Name: 'address',
  },
  AddressArray: {
    Type: PTBNodeType.SuiAddressArray,
    Name: 'address[]',
  },
  AddressVector: {
    Type: PTBNodeType.SuiAddressVector,
    Name: 'vector<address>',
  },
  Bool: {
    Type: PTBNodeType.SuiBool,
    Name: 'bool',
  },
  BoolArray: {
    Type: PTBNodeType.SuiBoolArray,
    Name: 'bool[]',
  },
  BoolVector: {
    Type: PTBNodeType.SuiBoolVector,
    Name: 'vector<bool>',
  },
  Number: {
    Type: PTBNodeType.SuiNumber,
    Name: 'number',
  },
  NumberArray: {
    Type: PTBNodeType.SuiNumberArray,
    Name: 'number[]',
  },
  NumberVectorU8: {
    Type: PTBNodeType.SuiNumberVector,
    Name: 'vector<u8>',
  },
  NumberVectorU16: {
    Type: PTBNodeType.SuiNumberVector,
    Name: 'vector<u16>',
  },
  NumberVectorU32: {
    Type: PTBNodeType.SuiNumberVector,
    Name: 'vector<u32>',
  },
  NumberVectorU64: {
    Type: PTBNodeType.SuiNumberVector,
    Name: 'vector<u64>',
  },
  NumberVectorU128: {
    Type: PTBNodeType.SuiNumberVector,
    Name: 'vector<u128>',
  },
  NumberVectorU256: {
    Type: PTBNodeType.SuiNumberVector,
    Name: 'vector<u256>',
  },
  ObjectGas: {
    Type: PTBNodeType.SuiObjectGas,
    Name: 'gas',
  },
  Object: {
    Type: PTBNodeType.SuiObject,
    Name: 'object',
  },
  ObjectArray: {
    Type: PTBNodeType.SuiObjectArray,
    Name: 'object[]',
  },
  ObjectVector: {
    Type: PTBNodeType.SuiObjectVector,
    Name: 'vector<object>',
  },
  String: {
    Type: PTBNodeType.SuiString,
    Name: 'string',
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
