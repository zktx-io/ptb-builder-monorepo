import { PTBTemplateItem } from './type';

const exchange_all_for_sui = {
  version: 'ptb_3',
  chain: 'sui:testnet',
  view: {
    x: 104.41038812785382,
    y: 305.5111301369863,
    zoom: 0.7876712328767124,
  },
  graph: {
    nodes: [
      {
        id: '@start',
        kind: 'Start',
        label: 'Start',
        position: { x: 13.44420289855077, y: -31.348913043478262 },
        ports: [{ id: 'next', direction: 'out', role: 'flow' }],
      },
      {
        id: '@end',
        kind: 'End',
        label: 'End',
        position: { x: 1293.4442028985509, y: -31.348913043478262 },
        ports: [{ id: 'prev', direction: 'in', role: 'flow' }],
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
        position: { x: 333.44420289855077, y: 114.65108695652174 },
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
        position: { x: 13.44420289855077, y: 68.65108695652174 },
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
        position: { x: 333.44420289855077, y: -31.348913043478262 },
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
            func: 'exchange_all_for_sui',
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
        position: { x: 653.4442028985508, y: -31.348913043478262 },
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
        position: { x: 973.4442028985508, y: -31.348913043478262 },
      },
      {
        id: 'var-8',
        kind: 'Variable',
        label: 'object',
        name: 'var',
        varType: { kind: 'object' },
        ports: [
          {
            id: 'out',
            role: 'io',
            direction: 'out',
            label: 'object',
            dataType: { kind: 'object' },
            typeStr: 'object',
          },
        ],
        position: { x: 13.44420289855077, y: 168.65108695652174 },
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
        position: { x: 653.4442028985508, y: 210.65108695652174 },
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
        id: 'edge-9',
        kind: 'io',
        source: 'var-8',
        target: 'cmd-0',
        sourceHandle: 'out:object',
        targetHandle: 'in_coin:object',
      },
      {
        id: 'edge-10',
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
    '0x13c1294a0cbcb19f2a3ee9b3c8db2414dfba1f18fb67ebf6477a05d6e1fed633': {
      objectId:
        '0x13c1294a0cbcb19f2a3ee9b3c8db2414dfba1f18fb67ebf6477a05d6e1fed633',
      typeTag:
        '0x2::coin::Coin<0x8270feb7375eee355e64fdb69c50abb6b5f9393a722883c1cf45f8e26048810a::wal::WAL>',
    },
  },
};

export const PTBTemplate_exchange_all_for_sui: PTBTemplateItem = {
  id: 'exchange_all_for_sui',
  label: 'Exchange All for Sui Template',
  description: 'Sample exchange all for Sui (testnet)',
  defaultName: 'exchange_all_for_sui.ptb',
  detail:
    'Exchange Wal for Sui. Works only on testnet. For mainnet, you must use the mainnet contract.',
  file: () => JSON.stringify(exchange_all_for_sui, undefined, 2),
};
