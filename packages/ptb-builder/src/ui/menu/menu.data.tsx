// src/ui/menu/menu.data.tsx
import React from 'react';

import { Brackets, Download, FunctionSquare, Merge, Split } from 'lucide-react';
/**
 * Menu model for the canvas context menu.
 * - UI cardinality is unified as 'single' | 'multi'.
 * - Variable icons use only CSS markers (no logical meaning).
 * - Command actions use canonical CommandKind keys.
 */
export const CanvasCmd = [
  { name: 'SplitCoins', action: 'cmd/splitCoins', icon: <Split /> },
  { name: 'MergeCoins', action: 'cmd/mergeCoins', icon: <Merge /> },
  {
    name: 'TransferObjects',
    action: 'cmd/transferObjects',
    icon: <Download />,
  },
  { name: 'MakeMoveVec', action: 'cmd/makeMoveVec', icon: <Brackets /> },
  { name: 'MoveCall', action: 'cmd/moveCall', icon: <FunctionSquare /> },
];

export const CanvasVar = [
  {
    label: 'Address',
    items: [
      {
        name: 'my wallet',
        action: 'var/address/wallet',
        icon: <span className="ptb-marker ptb-marker--address" />,
      },
      {
        name: 'address',
        action: 'var/address/single',
        icon: <span className="ptb-marker ptb-marker--address" />,
      },
      {
        name: 'addresses (multi)',
        action: 'var/address/multi',
        icon: (
          <span className="ptb-marker ptb-marker--multi ptb-marker--address" />
        ),
      },
    ],
  },
  {
    label: 'Object',
    items: [
      {
        name: 'gas',
        action: 'var/object/gas',
        icon: <span className="ptb-marker ptb-marker--object" />,
      },
      {
        name: 'clock',
        action: 'var/object/clock',
        icon: <span className="ptb-marker ptb-marker--object" />,
      },
      {
        name: 'random',
        action: 'var/object/random',
        icon: <span className="ptb-marker ptb-marker--object" />,
      },
      {
        name: 'system',
        action: 'var/object/system',
        icon: <span className="ptb-marker ptb-marker--object" />,
      },
      {
        name: 'object',
        action: 'var/object/single',
        icon: <span className="ptb-marker ptb-marker--object" />,
      },
      {
        name: 'objects (multi)',
        action: 'var/object/multi',
        icon: (
          <span className="ptb-marker ptb-marker--multi ptb-marker--object" />
        ),
      },
    ],
  },
  {
    label: 'Boolean',
    items: [
      {
        name: 'bool',
        action: 'var/bool/single',
        icon: <span className="ptb-marker ptb-marker--bool" />,
      },
      {
        name: 'bools (multi)',
        action: 'var/bool/multi',
        icon: (
          <span className="ptb-marker ptb-marker--multi ptb-marker--bool" />
        ),
      },
    ],
  },
  {
    label: 'String',
    items: [
      {
        name: 'string',
        action: 'var/string/single',
        icon: <span className="ptb-marker ptb-marker--string" />,
      },
      {
        name: 'strings (multi)',
        action: 'var/string/multi',
        icon: (
          <span className="ptb-marker ptb-marker--multi ptb-marker--string" />
        ),
      },
      {
        name: '0x2::sui::SUI',
        action: 'var/string/0x2suiSui',
        icon: <span className="ptb-marker ptb-marker--string" />,
      },
    ],
  },
  {
    label: 'Number',
    items: [
      {
        name: 'number',
        action: 'var/number/single',
        icon: <span className="ptb-marker ptb-marker--number" />,
      },
      {
        name: 'numbers (multi)',
        action: 'var/number/multi',
        icon: (
          <span className="ptb-marker ptb-marker--multi ptb-marker--number" />
        ),
      },
    ],
  },
  {
    label: 'Helpers',
    items: [
      {
        name: 'coinWithBalance',
        action: 'var/helper/coinWithBalance',
        icon: <span className="ptb-marker ptb-marker--object" />,
      },
      {
        name: 'denyList',
        action: 'var/helper/denyList',
        icon: <span className="ptb-marker ptb-marker--object" />,
      },
      {
        name: 'option',
        action: 'var/helper/option',
        icon: <span className="ptb-marker ptb-marker--object" />,
      },
    ],
  },
];

export const NodeMenu = [{ name: 'delete', action: 'delete_node' }];
export const EdgeMenu = [{ name: 'delete', action: 'delete_edge' }];
