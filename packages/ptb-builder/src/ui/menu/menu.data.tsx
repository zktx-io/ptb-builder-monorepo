// src/ui/menu/menu.data.tsx
// -----------------------------------------------------------------------------
// Context menu data definitions.
// - Commands: flat list (with icons for recognizability)
// - Scalars: flat quick actions (address, number, bool, string, id, object)
// - Vectors: grouped submenu (u8..u256, bool, string, address, id, object)
// - Resources: grouped submenu (wallet, gas, clock, random, system)
// Scalars/vectors/resources use type markers (colored handles).
// -----------------------------------------------------------------------------

import React from 'react';

import { Brackets, Download, FunctionSquare, Merge, Split } from 'lucide-react';

/** ------------------------------------------------------------------
 * Command section (flat, with lucide-react icons)
 * Canonical action keys: "cmd/<CommandKind>"
 * ----------------------------------------------------------------- */
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

/** ------------------------------------------------------------------
 * Scalar quick actions (flat, using type markers)
 * Canonical action keys: "var/scalar/<kind>"
 * ----------------------------------------------------------------- */
export const CanvasScalarQuick = [
  {
    name: 'address',
    action: 'var/scalar/address',
    icon: <span className="ptb-marker ptb-marker--address" />,
  },
  {
    name: 'number',
    action: 'var/scalar/number',
    icon: <span className="ptb-marker ptb-marker--number" />,
  },
  {
    name: 'bool',
    action: 'var/scalar/bool',
    icon: <span className="ptb-marker ptb-marker--bool" />,
  },
  {
    name: 'string',
    action: 'var/scalar/string',
    icon: <span className="ptb-marker ptb-marker--string" />,
  },
  {
    name: 'id',
    action: 'var/scalar/id',
    icon: <span className="ptb-marker ptb-marker--id" />,
  },
  {
    name: 'object',
    action: 'var/scalar/object',
    icon: <span className="ptb-marker ptb-marker--object" />,
  },
];

/** ------------------------------------------------------------------
 * Vector submenu (grouped under "Vector")
 * Canonical action keys: "var/vector/<kind>"
 * ----------------------------------------------------------------- */
export const CanvasVector = {
  label: 'Vector',
  items: [
    {
      name: 'vector<u8>',
      action: 'var/vector/u8',
      icon: <span className="ptb-marker ptb-marker--number" />,
    },
    {
      name: 'vector<u16>',
      action: 'var/vector/u16',
      icon: <span className="ptb-marker ptb-marker--number" />,
    },
    {
      name: 'vector<u32>',
      action: 'var/vector/u32',
      icon: <span className="ptb-marker ptb-marker--number" />,
    },
    {
      name: 'vector<u64>',
      action: 'var/vector/u64',
      icon: <span className="ptb-marker ptb-marker--number" />,
    },
    {
      name: 'vector<u128>',
      action: 'var/vector/u128',
      icon: <span className="ptb-marker ptb-marker--number" />,
    },
    {
      name: 'vector<u256>',
      action: 'var/vector/u256',
      icon: <span className="ptb-marker ptb-marker--number" />,
    },
    {
      name: 'vector<bool>',
      action: 'var/vector/bool',
      icon: <span className="ptb-marker ptb-marker--bool" />,
    },
    {
      name: 'vector<string>',
      action: 'var/vector/string',
      icon: <span className="ptb-marker ptb-marker--string" />,
    },
    {
      name: 'vector<address>',
      action: 'var/vector/address',
      icon: <span className="ptb-marker ptb-marker--address" />,
    },
    {
      name: 'vector<id>',
      action: 'var/vector/id',
      icon: <span className="ptb-marker ptb-marker--id" />,
    },
  ],
};

/** ------------------------------------------------------------------
 * Option submenu (grouped under "Option")
 * Canonical action keys: "var/option/<kind>"
 * ----------------------------------------------------------------- */
export const CanvasOption = {
  label: 'Option',
  items: [
    // move numeric widths
    {
      name: 'option<u8>',
      action: 'var/option/u8',
      icon: <span className="ptb-marker ptb-marker--number" />,
    },
    {
      name: 'option<u16>',
      action: 'var/option/u16',
      icon: <span className="ptb-marker ptb-marker--number" />,
    },
    {
      name: 'option<u32>',
      action: 'var/option/u32',
      icon: <span className="ptb-marker ptb-marker--number" />,
    },
    {
      name: 'option<u64>',
      action: 'var/option/u64',
      icon: <span className="ptb-marker ptb-marker--number" />,
    },
    {
      name: 'option<u128>',
      action: 'var/option/u128',
      icon: <span className="ptb-marker ptb-marker--number" />,
    },
    {
      name: 'option<u256>',
      action: 'var/option/u256',
      icon: <span className="ptb-marker ptb-marker--number" />,
    },
    {
      name: 'option<bool>',
      action: 'var/option/bool',
      icon: <span className="ptb-marker ptb-marker--bool" />,
    },
    {
      name: 'option<string>',
      action: 'var/option/string',
      icon: <span className="ptb-marker ptb-marker--string" />,
    },
    {
      name: 'option<address>',
      action: 'var/option/address',
      icon: <span className="ptb-marker ptb-marker--address" />,
    },
    {
      name: 'option<id>',
      action: 'var/option/id',
      icon: <span className="ptb-marker ptb-marker--id" />,
    },
  ],
};

/** ------------------------------------------------------------------
 * Resources submenu (singletons / convenience)
 * Canonical action keys: "var/resource/<name>"
 * ----------------------------------------------------------------- */
export const CanvasResources = {
  label: 'Resources',
  items: [
    {
      name: 'my wallet',
      action: 'var/resource/wallet',
      icon: <span className="ptb-marker ptb-marker--address" />,
    },
    {
      name: 'gas',
      action: 'var/resource/gas',
      icon: <span className="ptb-marker ptb-marker--object" />,
    },
    {
      name: 'clock',
      action: 'var/resource/clock',
      icon: <span className="ptb-marker ptb-marker--object" />,
    },
    {
      name: 'random',
      action: 'var/resource/random',
      icon: <span className="ptb-marker ptb-marker--object" />,
    },
    {
      name: 'system',
      action: 'var/resource/system',
      icon: <span className="ptb-marker ptb-marker--object" />,
    },
  ],
};

/** ------------------------------------------------------------------
 * Node / Edge context menu actions
 * ----------------------------------------------------------------- */
export const NodeMenu = [{ name: 'delete', action: 'delete_node' }];
export const EdgeMenu = [{ name: 'delete', action: 'delete_edge' }];
