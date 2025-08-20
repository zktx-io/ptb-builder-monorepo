// menu.data.tsx
import React from 'react';

import {
  IconBrackets,
  IconCircle,
  IconMerge,
  IconMoveCall,
  IconSplit,
  IconSquare,
  IconTransfer,
  IconTriangle,
} from './icons';

export const CanvasCmd = [
  { name: 'SplitCoins', action: 'cmd/SplitCoins', icon: <IconSplit /> },
  { name: 'MergeCoins', action: 'cmd/MergeCoins', icon: <IconMerge /> },
  {
    name: 'TransferObjects',
    action: 'cmd/TransferObjects',
    icon: <IconTransfer />,
  },
  { name: 'MakeMoveVec', action: 'cmd/MakeMoveVec', icon: <IconBrackets /> },
  { name: 'MoveCall', action: 'cmd/MoveCall', icon: <IconMoveCall /> },
];

export const CanvasVar = [
  {
    label: 'Address',
    items: [
      {
        name: 'my wallet',
        action: 'var/address/AddressWallet',
        icon: <IconCircle color="bg-yellow-500" />,
      },
      {
        name: 'address',
        action: 'var/address/Address',
        icon: <IconCircle color="bg-yellow-500" />,
      },
      {
        name: 'address[]',
        action: 'var/address/AddressArray',
        icon: <IconSquare color="bg-yellow-500" />,
      },
      {
        name: 'vector<address>',
        action: 'var/address/AddressVector',
        icon: <IconTriangle color="text-yellow-500" />,
      },
    ],
  },
  {
    label: 'Object',
    items: [
      {
        name: 'gas',
        action: 'var/object/ObjectGas',
        icon: <IconCircle color="bg-blue-500" />,
      },
      {
        name: 'object',
        action: 'var/object/Object',
        icon: <IconCircle color="bg-blue-500" />,
      },
      {
        name: 'object[]',
        action: 'var/object/ObjectArray',
        icon: <IconSquare color="bg-blue-500" />,
      },
      {
        name: 'vector<object>',
        action: 'var/object/ObjectVector',
        icon: <IconTriangle color="text-blue-500" />,
      },
    ],
  },
  {
    label: 'Boolean',
    items: [
      {
        name: 'bool',
        action: 'var/bool/Bool',
        icon: <IconCircle color="bg-purple-500" />,
      },
      {
        name: 'bool[]',
        action: 'var/bool/BoolArray',
        icon: <IconSquare color="bg-purple-500" />,
      },
      {
        name: 'vector<bool>',
        action: 'var/bool/BoolVector',
        icon: <IconTriangle color="text-purple-500" />,
      },
    ],
  },
  {
    label: 'String',
    items: [
      {
        name: 'string',
        action: 'var/string/String',
        icon: <IconCircle color="bg-green-500" />,
      },
      {
        name: 'string[]',
        action: 'var/string/StringArray',
        icon: <IconSquare color="bg-green-500" />,
      },
      {
        name: 'vector<string>',
        action: 'var/string/StringVector',
        icon: <IconTriangle color="text-green-500" />,
      },
    ],
  },
  {
    label: 'Number', // unified in UI
    items: [
      {
        name: 'number',
        action: 'var/number/Number',
        icon: <IconCircle color="bg-red-500" />,
      },
      {
        name: 'number[]',
        action: 'var/number/NumberArray',
        icon: <IconSquare color="bg-red-500" />,
      },
      {
        name: 'vector<number>',
        action: 'var/number/NumberVector',
        icon: <IconTriangle color="text-red-500" />,
      },
    ],
  },
  {
    label: 'Helpers',
    items: [
      {
        name: '0x2::sui::SUI',
        action: 'var/string/String0x2suiSui',
        icon: <IconCircle color="bg-green-500" />,
      },
      {
        name: 'clock',
        action: 'var/object/ObjectClock',
        icon: <IconCircle color="bg-blue-500" />,
      },
      {
        name: 'coinWithBalance',
        action: 'var/object/ObjectCoinWithBalance',
        icon: <IconCircle color="bg-blue-500" />,
      },
      {
        name: 'denyList',
        action: 'var/object/ObjectDenyList',
        icon: <IconCircle color="bg-blue-500" />,
      },
      {
        name: 'option',
        action: 'var/object/ObjectOption',
        icon: <IconCircle color="bg-blue-500" />,
      },
      {
        name: 'random',
        action: 'var/object/ObjectRandom',
        icon: <IconCircle color="bg-blue-500" />,
      },
      {
        name: 'system',
        action: 'var/object/ObjectSystem',
        icon: <IconCircle color="bg-blue-500" />,
      },
      {
        name: 'object[]',
        action: 'var/object/ObjectArray',
        icon: <IconSquare color="bg-blue-500" />,
      },
      {
        name: 'vector<object>',
        action: 'var/object/ObjectVector',
        icon: <IconTriangle color="text-blue-500" />,
      },
    ],
  },
];

export const NodeMenu = [{ name: 'delete', action: 'delete_node' }];
export const EdgeMenu = [{ name: 'delete', action: 'delete_edge' }];
