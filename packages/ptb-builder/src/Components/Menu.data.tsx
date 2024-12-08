import React from 'react';

import { IconCircle } from './IconCircle';
import { IconSquare } from './IconSquare';
import { IconTriangle } from './IconTriangle';

export enum MENU {
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

export enum MENU_NODE {
  Delete = 'Delete',
}

export enum MENU_EDGE {
  Delete = 'Delete',
}

export interface MenuItem {
  name: string;
  type: MENU | MENU_NODE | MENU_EDGE;
  icon?: React.ReactNode;
}

export const MenuList: {
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
          name: 'address',
          type: MENU.SuiAddress,
          icon: <IconCircle color="bg-yellow-500" />,
        },
        {
          name: 'address[]',
          type: MENU.SuiAddressArray,
          icon: <IconSquare color="bg-yellow-500" />,
        },
        {
          name: 'vector<address>',
          type: MENU.SuiAddressVector,
          icon: <IconTriangle color="text-yellow-500" />,
        },
      ],
    },
    {
      name: 'Number',
      submenu: [
        {
          name: 'number',
          type: MENU.SuiNumber,
          icon: <IconCircle color="bg-red-500" />,
        },
        {
          name: 'number[]',
          type: MENU.SuiNumberArray,
          icon: <IconSquare color="bg-red-500" />,
        },
        {
          name: 'vector<u8>',
          type: MENU.SuiNumberVector,
          icon: <IconTriangle color="text-red-500" />,
        },
        {
          name: 'vector<u16>',
          type: MENU.SuiNumberVector,
          icon: <IconTriangle color="text-red-500" />,
        },
        {
          name: 'vector<u32>',
          type: MENU.SuiNumberVector,
          icon: <IconTriangle color="text-red-500" />,
        },
        {
          name: 'vector<u64>',
          type: MENU.SuiNumberVector,
          icon: <IconTriangle color="text-red-500" />,
        },
        {
          name: 'vector<u128>',
          type: MENU.SuiNumberVector,
          icon: <IconTriangle color="text-red-500" />,
        },
        {
          name: 'vector<u256>',
          type: MENU.SuiNumberVector,
          icon: <IconTriangle color="text-red-500" />,
        },
      ],
    },
    {
      name: 'String',
      submenu: [
        {
          name: 'string',
          type: MENU.SuiString,
          icon: <IconCircle color="bg-green-500" />,
        },
      ],
    },
    {
      name: 'Object',
      submenu: [
        {
          name: 'gas',
          type: MENU.SuiObjectGas,
          icon: <IconCircle color="bg-blue-500" />,
        },
        {
          name: 'object',
          type: MENU.SuiObject,
          icon: <IconCircle color="bg-blue-500" />,
        },
        {
          name: 'object[]',
          type: MENU.SuiObjectArray,
          icon: <IconSquare color="bg-blue-500" />,
        },
        {
          name: 'vector<object>',
          type: MENU.SuiObjectVector,
          icon: <IconTriangle color="text-blue-500" />,
        },
      ],
    },
    {
      name: 'Boolean',
      submenu: [
        {
          name: 'bool',
          type: MENU.SuiBool,
          icon: <IconCircle color="bg-pink-500" />,
        },
        {
          name: 'bool []',
          type: MENU.SuiBoolArray,
          icon: <IconSquare color="bg-pink-500" />,
        },
        {
          name: 'vector<bool>',
          type: MENU.SuiBoolVector,
          icon: <IconTriangle color="text-pink-500" />,
        },
      ],
    },
  ],
  transactions: [
    {
      name: 'merge coins',
      type: MENU.MergeCoins,
    },
    {
      name: 'split coins',
      type: MENU.SplitCoins,
    },
    {
      name: 'transfer objects',
      type: MENU.TransferObjects,
    },
    {
      name: 'move call',
      type: MENU.MoveCall,
    },
  ],
  node: [
    {
      name: 'delete',
      type: MENU_NODE.Delete,
    },
  ],
  edge: [
    {
      name: 'delete',
      type: MENU_EDGE.Delete,
    },
  ],
};
