import { PTBTemplateItem } from './type';

const exchange_all_for_wal = {
  version: 'ptb_3',
  chain: 'sui:testnet',
  view: {
    x: 148.41038812785382,
    y: 122.79195205479454,
    zoom: 0.7876712328767124,
  },
  graph: {
    nodes: [
      {
        id: '@start',
        kind: 'Start',
        label: 'Start',
        position: { x: -42.41666666666663, y: 209.62499999999994 },
        ports: [{ id: 'next', direction: 'out', role: 'flow' }],
      },
      {
        id: '@end',
        kind: 'End',
        label: 'End',
        position: { x: 1237.5833333333335, y: 209.62499999999994 },
        ports: [{ id: 'prev', direction: 'in', role: 'flow' }],
      },
      {
        id: '@gas',
        kind: 'Variable',
        label: 'gas',
        name: 'gas',
        varType: { kind: 'object' },
        ports: [
          {
            id: 'out',
            role: 'io',
            direction: 'out',
            label: 'gas',
            dataType: { kind: 'object' },
            typeStr: 'object',
          },
        ],
        position: { x: -42.41666666666663, y: 309.62499999999994 },
      },
      {
        id: 'input-0',
        kind: 'Variable',
        label: 'object',
        name: 'var',
        varType: {
          kind: 'object',
          typeTag:
            '0x82593828ed3fcb8c6a235eac9abd0adbe9c5f9bbffa9b1e7a45cdd884481ef9f::wal_exchange::Exchange',
        },
        value:
          '0xf4d164ea2def5fe07dc573992a029e010dba09b1a8dcbc44c5c2e79567f39073',
        ports: [
          {
            id: 'out',
            role: 'io',
            direction: 'out',
            label: 'object',
            dataType: {
              kind: 'object',
              typeTag:
                '0x82593828ed3fcb8c6a235eac9abd0adbe9c5f9bbffa9b1e7a45cdd884481ef9f::wal_exchange::Exchange',
            },
            typeStr:
              'object<0x82593828ed3fcb8c6a235eac9abd0adbe9c5f9bbffa9b1e7a45cdd884481ef9f::wal_exchange::Exchange>',
          },
        ],
        position: { x: 277.58333333333337, y: 355.62499999999994 },
      },
      {
        id: 'input-1',
        kind: 'Variable',
        label: 'number',
        name: 'var',
        varType: { kind: 'scalar', name: 'number' },
        value: '500000000',
        ports: [
          {
            id: 'out',
            role: 'io',
            direction: 'out',
            label: 'number',
            dataType: { kind: 'scalar', name: 'number' },
            typeStr: 'number',
          },
        ],
        position: { x: -42.41666666666663, y: 409.62499999999994 },
      },
      {
        id: 'cmd-0',
        kind: 'Command',
        label: 'SplitCoins',
        command: 'splitCoins',
        params: { ui: { amountsCount: 1 } },
        ports: [
          { id: 'prev', direction: 'in', role: 'flow' },
          { id: 'next', direction: 'out', role: 'flow' },
          {
            id: 'in_coin',
            direction: 'in',
            role: 'io',
            dataType: { kind: 'object' },
            label: 'in_coin',
          },
          {
            id: 'in_amount_0',
            direction: 'in',
            role: 'io',
            dataType: { kind: 'move_numeric', width: 'u64' },
            label: 'in_amount_0',
          },
          {
            id: 'out_coin_0',
            direction: 'out',
            role: 'io',
            dataType: { kind: 'object' },
            label: 'out_coin_0',
          },
        ],
        position: { x: 277.58333333333337, y: 209.62499999999994 },
      },
      {
        id: 'cmd-1',
        kind: 'Command',
        label: 'MoveCall',
        command: 'moveCall',
        params: {
          moveCall: {
            package:
              '0x82593828ed3fcb8c6a235eac9abd0adbe9c5f9bbffa9b1e7a45cdd884481ef9f',
            module: 'wal_exchange',
            function: 'exchange_all_for_wal',
            typeArgs: [],
          },
          ui: {
            pkgId:
              '0x82593828ed3fcb8c6a235eac9abd0adbe9c5f9bbffa9b1e7a45cdd884481ef9f',
            module: 'wal_exchange',
            func: 'exchange_all_for_wal',
            _fnTParams: [],
            _fnIns: [
              {
                kind: 'object',
                typeTag:
                  '0x82593828ed3fcb8c6a235eac9abd0adbe9c5f9bbffa9b1e7a45cdd884481ef9f::wal_exchange::Exchange',
              },
              { kind: 'object' },
            ],
            _fnOuts: [{ kind: 'object' }],
            _nameModules_: ['wal_exchange'],
            _moduleFunctions_: {
              wal_exchange: [
                'add_all_sui',
                'add_all_wal',
                'add_sui',
                'add_wal',
                'exchange_all_for_sui',
                'exchange_all_for_wal',
                'exchange_for_sui',
                'exchange_for_wal',
                'new',
                'new_exchange_rate',
                'new_funded',
                'set_exchange_rate',
                'withdraw_sui',
                'withdraw_wal',
              ],
            },
            _fnSigs_: {
              wal_exchange: {
                add_all_sui: {
                  tparamCount: 0,
                  ins: [
                    {
                      kind: 'object',
                      typeTag:
                        '0x82593828ed3fcb8c6a235eac9abd0adbe9c5f9bbffa9b1e7a45cdd884481ef9f::wal_exchange::Exchange',
                    },
                    { kind: 'object' },
                  ],
                  outs: [],
                },
                add_all_wal: {
                  tparamCount: 0,
                  ins: [
                    {
                      kind: 'object',
                      typeTag:
                        '0x82593828ed3fcb8c6a235eac9abd0adbe9c5f9bbffa9b1e7a45cdd884481ef9f::wal_exchange::Exchange',
                    },
                    { kind: 'object' },
                  ],
                  outs: [],
                },
                add_sui: {
                  tparamCount: 0,
                  ins: [
                    {
                      kind: 'object',
                      typeTag:
                        '0x82593828ed3fcb8c6a235eac9abd0adbe9c5f9bbffa9b1e7a45cdd884481ef9f::wal_exchange::Exchange',
                    },
                    { kind: 'object' },
                    { kind: 'move_numeric', width: 'u64' },
                  ],
                  outs: [],
                },
                add_wal: {
                  tparamCount: 0,
                  ins: [
                    {
                      kind: 'object',
                      typeTag:
                        '0x82593828ed3fcb8c6a235eac9abd0adbe9c5f9bbffa9b1e7a45cdd884481ef9f::wal_exchange::Exchange',
                    },
                    { kind: 'object' },
                    { kind: 'move_numeric', width: 'u64' },
                  ],
                  outs: [],
                },
                exchange_all_for_sui: {
                  tparamCount: 0,
                  ins: [
                    {
                      kind: 'object',
                      typeTag:
                        '0x82593828ed3fcb8c6a235eac9abd0adbe9c5f9bbffa9b1e7a45cdd884481ef9f::wal_exchange::Exchange',
                    },
                    { kind: 'object' },
                  ],
                  outs: [{ kind: 'object' }],
                },
                exchange_all_for_wal: {
                  tparamCount: 0,
                  ins: [
                    {
                      kind: 'object',
                      typeTag:
                        '0x82593828ed3fcb8c6a235eac9abd0adbe9c5f9bbffa9b1e7a45cdd884481ef9f::wal_exchange::Exchange',
                    },
                    { kind: 'object' },
                  ],
                  outs: [{ kind: 'object' }],
                },
                exchange_for_sui: {
                  tparamCount: 0,
                  ins: [
                    {
                      kind: 'object',
                      typeTag:
                        '0x82593828ed3fcb8c6a235eac9abd0adbe9c5f9bbffa9b1e7a45cdd884481ef9f::wal_exchange::Exchange',
                    },
                    { kind: 'object' },
                    { kind: 'move_numeric', width: 'u64' },
                  ],
                  outs: [{ kind: 'object' }],
                },
                exchange_for_wal: {
                  tparamCount: 0,
                  ins: [
                    {
                      kind: 'object',
                      typeTag:
                        '0x82593828ed3fcb8c6a235eac9abd0adbe9c5f9bbffa9b1e7a45cdd884481ef9f::wal_exchange::Exchange',
                    },
                    { kind: 'object' },
                    { kind: 'move_numeric', width: 'u64' },
                  ],
                  outs: [{ kind: 'object' }],
                },
                new: {
                  tparamCount: 0,
                  ins: [],
                  outs: [
                    {
                      kind: 'object',
                      typeTag:
                        '0x82593828ed3fcb8c6a235eac9abd0adbe9c5f9bbffa9b1e7a45cdd884481ef9f::wal_exchange::AdminCap',
                    },
                  ],
                },
                new_exchange_rate: {
                  tparamCount: 0,
                  ins: [
                    { kind: 'move_numeric', width: 'u64' },
                    { kind: 'move_numeric', width: 'u64' },
                  ],
                  outs: [
                    {
                      kind: 'object',
                      typeTag:
                        '0x82593828ed3fcb8c6a235eac9abd0adbe9c5f9bbffa9b1e7a45cdd884481ef9f::wal_exchange::ExchangeRate',
                    },
                  ],
                },
                new_funded: {
                  tparamCount: 0,
                  ins: [
                    { kind: 'object' },
                    { kind: 'move_numeric', width: 'u64' },
                  ],
                  outs: [
                    {
                      kind: 'object',
                      typeTag:
                        '0x82593828ed3fcb8c6a235eac9abd0adbe9c5f9bbffa9b1e7a45cdd884481ef9f::wal_exchange::AdminCap',
                    },
                  ],
                },
                set_exchange_rate: {
                  tparamCount: 0,
                  ins: [
                    {
                      kind: 'object',
                      typeTag:
                        '0x82593828ed3fcb8c6a235eac9abd0adbe9c5f9bbffa9b1e7a45cdd884481ef9f::wal_exchange::Exchange',
                    },
                    { kind: 'move_numeric', width: 'u64' },
                    { kind: 'move_numeric', width: 'u64' },
                    {
                      kind: 'object',
                      typeTag:
                        '0x82593828ed3fcb8c6a235eac9abd0adbe9c5f9bbffa9b1e7a45cdd884481ef9f::wal_exchange::AdminCap',
                    },
                  ],
                  outs: [],
                },
                withdraw_sui: {
                  tparamCount: 0,
                  ins: [
                    {
                      kind: 'object',
                      typeTag:
                        '0x82593828ed3fcb8c6a235eac9abd0adbe9c5f9bbffa9b1e7a45cdd884481ef9f::wal_exchange::Exchange',
                    },
                    { kind: 'move_numeric', width: 'u64' },
                    {
                      kind: 'object',
                      typeTag:
                        '0x82593828ed3fcb8c6a235eac9abd0adbe9c5f9bbffa9b1e7a45cdd884481ef9f::wal_exchange::AdminCap',
                    },
                  ],
                  outs: [{ kind: 'object' }],
                },
                withdraw_wal: {
                  tparamCount: 0,
                  ins: [
                    {
                      kind: 'object',
                      typeTag:
                        '0x82593828ed3fcb8c6a235eac9abd0adbe9c5f9bbffa9b1e7a45cdd884481ef9f::wal_exchange::Exchange',
                    },
                    { kind: 'move_numeric', width: 'u64' },
                    {
                      kind: 'object',
                      typeTag:
                        '0x82593828ed3fcb8c6a235eac9abd0adbe9c5f9bbffa9b1e7a45cdd884481ef9f::wal_exchange::AdminCap',
                    },
                  ],
                  outs: [{ kind: 'object' }],
                },
              },
            },
            pkgLocked: true,
          },
        },
        ports: [
          { id: 'prev', direction: 'in', role: 'flow' },
          { id: 'next', direction: 'out', role: 'flow' },
          {
            id: 'in_arg_0',
            role: 'io',
            direction: 'in',
            dataType: {
              kind: 'object',
              typeTag:
                '0x82593828ed3fcb8c6a235eac9abd0adbe9c5f9bbffa9b1e7a45cdd884481ef9f::wal_exchange::Exchange',
            },
            typeStr:
              'object<0x82593828ed3fcb8c6a235eac9abd0adbe9c5f9bbffa9b1e7a45cdd884481ef9f::wal_exchange::Exchange>',
            label: 'arg0',
          },
          {
            id: 'in_arg_1',
            role: 'io',
            direction: 'in',
            dataType: { kind: 'object' },
            typeStr: 'object',
            label: 'arg1',
          },
          {
            id: 'out_ret_0',
            role: 'io',
            direction: 'out',
            dataType: { kind: 'object' },
            typeStr: 'object',
            label: 'ret0',
          },
        ],
        position: { x: 597.5833333333334, y: 209.62499999999994 },
      },
      {
        id: 'cmd-2',
        kind: 'Command',
        label: 'TransferObjects',
        command: 'transferObjects',
        params: { ui: { objectsCount: 1 } },
        ports: [
          { id: 'prev', direction: 'in', role: 'flow' },
          { id: 'next', direction: 'out', role: 'flow' },
          {
            id: 'in_recipient',
            direction: 'in',
            role: 'io',
            dataType: { kind: 'scalar', name: 'address' },
            label: 'in_recipient',
          },
          {
            id: 'in_object_0',
            direction: 'in',
            role: 'io',
            dataType: { kind: 'object' },
            label: 'in_object_0',
          },
        ],
        position: { x: 917.5833333333334, y: 209.62499999999994 },
      },
      {
        id: '@my_wallet',
        kind: 'Variable',
        label: 'my wallet',
        name: 'sender',
        varType: { kind: 'scalar', name: 'address' },
        ports: [
          {
            id: 'out',
            role: 'io',
            direction: 'out',
            label: 'my wallet',
            dataType: { kind: 'scalar', name: 'address' },
            typeStr: 'address',
          },
        ],
        position: { x: 597.5833333333334, y: 451.62499999999994 },
      },
    ],
    edges: [
      {
        id: 'flow:@start->cmd-0',
        kind: 'flow',
        source: '@start',
        target: 'cmd-0',
        sourceHandle: 'next',
        targetHandle: 'prev',
      },
      {
        id: 'io:@gas->cmd-0[coin]',
        kind: 'io',
        source: '@gas',
        target: 'cmd-0',
        sourceHandle: 'out:object',
        targetHandle: 'in_coin:object',
      },
      {
        id: 'io:input-1->cmd-0[amount_0]',
        kind: 'io',
        source: 'input-1',
        target: 'cmd-0',
        sourceHandle: 'out:number',
        targetHandle: 'in_amount_0:number',
      },
      {
        id: 'flow:cmd-0->cmd-1',
        kind: 'flow',
        source: 'cmd-0',
        target: 'cmd-1',
        sourceHandle: 'next',
        targetHandle: 'prev',
      },
      {
        id: 'io:input-0->cmd-1[arg_0]',
        kind: 'io',
        source: 'input-0',
        target: 'cmd-1',
        sourceHandle: 'out:object',
        targetHandle: 'in_arg_0:object',
      },
      {
        id: 'io:cmd-0->cmd-1[arg_1]',
        kind: 'io',
        source: 'cmd-0',
        target: 'cmd-1',
        sourceHandle: 'out_coin_0:object',
        targetHandle: 'in_arg_1:object',
      },
      {
        id: 'flow:cmd-1->cmd-2',
        kind: 'flow',
        source: 'cmd-1',
        target: 'cmd-2',
        sourceHandle: 'next',
        targetHandle: 'prev',
      },
      {
        id: 'io:cmd-1->cmd-2[obj_0]',
        kind: 'io',
        source: 'cmd-1',
        target: 'cmd-2',
        sourceHandle: 'out_ret_0:object',
        targetHandle: 'in_object_0:object',
      },
      {
        id: 'flow:cmd-2->@end',
        kind: 'flow',
        source: 'cmd-2',
        target: '@end',
        sourceHandle: 'next',
        targetHandle: 'prev',
      },
      {
        id: 'edge-3',
        kind: 'io',
        source: '@my_wallet',
        target: 'cmd-2',
        sourceHandle: 'out:address',
        targetHandle: 'in_recipient:address',
      },
    ],
  },
  modules: {
    '0x82593828ed3fcb8c6a235eac9abd0adbe9c5f9bbffa9b1e7a45cdd884481ef9f': {
      wal_exchange: {
        add_all_sui: {
          tparamCount: 0,
          ins: [
            {
              kind: 'object',
              typeTag:
                '0x82593828ed3fcb8c6a235eac9abd0adbe9c5f9bbffa9b1e7a45cdd884481ef9f::wal_exchange::Exchange',
            },
            { kind: 'object' },
          ],
          outs: [],
        },
        add_all_wal: {
          tparamCount: 0,
          ins: [
            {
              kind: 'object',
              typeTag:
                '0x82593828ed3fcb8c6a235eac9abd0adbe9c5f9bbffa9b1e7a45cdd884481ef9f::wal_exchange::Exchange',
            },
            { kind: 'object' },
          ],
          outs: [],
        },
        add_sui: {
          tparamCount: 0,
          ins: [
            {
              kind: 'object',
              typeTag:
                '0x82593828ed3fcb8c6a235eac9abd0adbe9c5f9bbffa9b1e7a45cdd884481ef9f::wal_exchange::Exchange',
            },
            { kind: 'object' },
            { kind: 'move_numeric', width: 'u64' },
          ],
          outs: [],
        },
        add_wal: {
          tparamCount: 0,
          ins: [
            {
              kind: 'object',
              typeTag:
                '0x82593828ed3fcb8c6a235eac9abd0adbe9c5f9bbffa9b1e7a45cdd884481ef9f::wal_exchange::Exchange',
            },
            { kind: 'object' },
            { kind: 'move_numeric', width: 'u64' },
          ],
          outs: [],
        },
        exchange_all_for_sui: {
          tparamCount: 0,
          ins: [
            {
              kind: 'object',
              typeTag:
                '0x82593828ed3fcb8c6a235eac9abd0adbe9c5f9bbffa9b1e7a45cdd884481ef9f::wal_exchange::Exchange',
            },
            { kind: 'object' },
          ],
          outs: [{ kind: 'object' }],
        },
        exchange_all_for_wal: {
          tparamCount: 0,
          ins: [
            {
              kind: 'object',
              typeTag:
                '0x82593828ed3fcb8c6a235eac9abd0adbe9c5f9bbffa9b1e7a45cdd884481ef9f::wal_exchange::Exchange',
            },
            { kind: 'object' },
          ],
          outs: [{ kind: 'object' }],
        },
        exchange_for_sui: {
          tparamCount: 0,
          ins: [
            {
              kind: 'object',
              typeTag:
                '0x82593828ed3fcb8c6a235eac9abd0adbe9c5f9bbffa9b1e7a45cdd884481ef9f::wal_exchange::Exchange',
            },
            { kind: 'object' },
            { kind: 'move_numeric', width: 'u64' },
          ],
          outs: [{ kind: 'object' }],
        },
        exchange_for_wal: {
          tparamCount: 0,
          ins: [
            {
              kind: 'object',
              typeTag:
                '0x82593828ed3fcb8c6a235eac9abd0adbe9c5f9bbffa9b1e7a45cdd884481ef9f::wal_exchange::Exchange',
            },
            { kind: 'object' },
            { kind: 'move_numeric', width: 'u64' },
          ],
          outs: [{ kind: 'object' }],
        },
        new: {
          tparamCount: 0,
          ins: [],
          outs: [
            {
              kind: 'object',
              typeTag:
                '0x82593828ed3fcb8c6a235eac9abd0adbe9c5f9bbffa9b1e7a45cdd884481ef9f::wal_exchange::AdminCap',
            },
          ],
        },
        new_exchange_rate: {
          tparamCount: 0,
          ins: [
            { kind: 'move_numeric', width: 'u64' },
            { kind: 'move_numeric', width: 'u64' },
          ],
          outs: [
            {
              kind: 'object',
              typeTag:
                '0x82593828ed3fcb8c6a235eac9abd0adbe9c5f9bbffa9b1e7a45cdd884481ef9f::wal_exchange::ExchangeRate',
            },
          ],
        },
        new_funded: {
          tparamCount: 0,
          ins: [{ kind: 'object' }, { kind: 'move_numeric', width: 'u64' }],
          outs: [
            {
              kind: 'object',
              typeTag:
                '0x82593828ed3fcb8c6a235eac9abd0adbe9c5f9bbffa9b1e7a45cdd884481ef9f::wal_exchange::AdminCap',
            },
          ],
        },
        set_exchange_rate: {
          tparamCount: 0,
          ins: [
            {
              kind: 'object',
              typeTag:
                '0x82593828ed3fcb8c6a235eac9abd0adbe9c5f9bbffa9b1e7a45cdd884481ef9f::wal_exchange::Exchange',
            },
            { kind: 'move_numeric', width: 'u64' },
            { kind: 'move_numeric', width: 'u64' },
            {
              kind: 'object',
              typeTag:
                '0x82593828ed3fcb8c6a235eac9abd0adbe9c5f9bbffa9b1e7a45cdd884481ef9f::wal_exchange::AdminCap',
            },
          ],
          outs: [],
        },
        withdraw_sui: {
          tparamCount: 0,
          ins: [
            {
              kind: 'object',
              typeTag:
                '0x82593828ed3fcb8c6a235eac9abd0adbe9c5f9bbffa9b1e7a45cdd884481ef9f::wal_exchange::Exchange',
            },
            { kind: 'move_numeric', width: 'u64' },
            {
              kind: 'object',
              typeTag:
                '0x82593828ed3fcb8c6a235eac9abd0adbe9c5f9bbffa9b1e7a45cdd884481ef9f::wal_exchange::AdminCap',
            },
          ],
          outs: [{ kind: 'object' }],
        },
        withdraw_wal: {
          tparamCount: 0,
          ins: [
            {
              kind: 'object',
              typeTag:
                '0x82593828ed3fcb8c6a235eac9abd0adbe9c5f9bbffa9b1e7a45cdd884481ef9f::wal_exchange::Exchange',
            },
            { kind: 'move_numeric', width: 'u64' },
            {
              kind: 'object',
              typeTag:
                '0x82593828ed3fcb8c6a235eac9abd0adbe9c5f9bbffa9b1e7a45cdd884481ef9f::wal_exchange::AdminCap',
            },
          ],
          outs: [{ kind: 'object' }],
        },
      },
    },
  },
  objects: {
    '0xf4d164ea2def5fe07dc573992a029e010dba09b1a8dcbc44c5c2e79567f39073': {
      objectId:
        '0xf4d164ea2def5fe07dc573992a029e010dba09b1a8dcbc44c5c2e79567f39073',
      typeTag:
        '0x82593828ed3fcb8c6a235eac9abd0adbe9c5f9bbffa9b1e7a45cdd884481ef9f::wal_exchange::Exchange',
    },
  },
};

export const PTBTemplate_exchange_all_for_wal: PTBTemplateItem = {
  id: 'exchange_all_for_wal',
  label: 'Exchange All for Wal Template',
  description: 'Sample exchange all for Wal (testnet)',
  defaultName: 'exchange_all_for_wal.ptb',
  detail:
    'Exchange Sui for Wal. Works only on testnet. For mainnet, you must use the mainnet contract.',
  file: () => JSON.stringify(exchange_all_for_wal, null, 2),
};
