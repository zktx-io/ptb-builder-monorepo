import { Transaction } from '@mysten/sui/transactions';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as ts from 'typescript';
import { describe, expect, it } from 'vitest';

import {
  assertRawConvertibleIR,
  assertTsSdkRenderableIR,
  createTransactionIR,
  detectPTBDocVersion,
  freezeDiagnostics,
  graphToTransactionIR,
  isStructuralTransactionIR,
  jsonStringifyWithBigInt,
  NULL_VALUE,
  parseBase64Bytes,
  parseJsonU64,
  parseMoveIdentifier,
  parseMoveTypeTag,
  parseObjectDigest,
  parseObjectId,
  parsePTBDocV4,
  parseStructuralTransactionIR,
  PTBModelError,
  rawTransactionToIR,
  transactionIRToGraph,
  transactionIRToMermaid,
  transactionIRToRaw,
  transactionIRToTsSdkCode,
  validatePTBDocV4,
  validatePTBGraph,
  validatePTBType,
  validateRawConvertibleIR,
  validateTransactionIR,
  validateTsSdkRenderableIR,
} from './index.js';
import type {
  CommandNode,
  IRInput,
  PTBGraph,
  PTBType,
  RawCallArg,
  RawCommand,
  RawProgrammableTransaction,
  TransactionIR,
  VariableNode,
} from './index.js';

function normalizedObjectId(value: string): string {
  return `0x${value.replace(/^0x/i, '').padStart(64, '0').toLowerCase()}`;
}

const TEST_DIGEST_1 = 'vQMG8nrGirX14JLfyzy15DrYD3gwRC1eUmBmBzYUsgh';
const TEST_DIGEST_2 = '7msXn7aieHy73WkRxh3Xdqh9PEoPYBmJW59iE4TVvz62';
const TEST_DIGEST_3 = 'C6G8PsqwNpMqrK7ApwuQUvDgzkFcUaUy6Y5ycrAN2q3F';
const TEST_SUI_TYPE = `${normalizedObjectId('2')}::sui::SUI`;
const TEST_COIN_TYPE = `${normalizedObjectId('2')}::coin::Coin`;
const TEST_COIN_SUI_TYPE = `${TEST_COIN_TYPE}<${TEST_SUI_TYPE}>`;

const modelSourceRoot = fileURLToPath(new URL('.', import.meta.url));
const modelPackageJsonPath = fileURLToPath(
  new URL('../package.json', import.meta.url),
);

describe('public package surface', () => {
  it('publishes one root entrypoint for the model source of truth', () => {
    const packageJson = JSON.parse(
      readFileSync(modelPackageJsonPath, 'utf8'),
    ) as {
      exports: unknown;
      files: unknown;
      dependencies?: Record<string, string>;
    };

    expect(packageJson.exports).toEqual({
      '.': {
        types: './dist/index.d.ts',
        import: './dist/index.js',
      },
    });
    expect(packageJson.files).toEqual(['dist/', 'README.md']);
    expect(packageJson.dependencies ?? {}).toEqual({
      '@mysten/sui': '2.16.2',
    });
  });

  it('keeps model source free of UI framework and runtime client imports', () => {
    const forbiddenSpecifiers = new Set([
      '@mysten/dapp-kit',
      '@mysten/sui/client',
      '@mysten/sui/jsonRpc',
      '@mysten/sui/transactions',
      '@xyflow/react',
      'react',
      'react-dom',
    ]);
    const violations = collectSourceFiles(modelSourceRoot)
      .filter((file) => !file.endsWith('.test.ts'))
      .flatMap((file) =>
        collectImportSpecifiers(readFileSync(file, 'utf8'))
          .filter(
            (specifier) =>
              forbiddenSpecifiers.has(specifier) ||
              specifier.startsWith('@mysten/sui/jsonRpc/'),
          )
          .map((specifier) => `${file}: ${specifier}`),
      );

    expect(violations).toEqual([]);
  });
});

function collectSourceFiles(root: string): string[] {
  return readdirSync(root).flatMap((entry) => {
    const path = join(root, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) return collectSourceFiles(path);
    return /\.ts$/.test(path) ? [path] : [];
  });
}

function collectImportSpecifiers(text: string): string[] {
  return [
    ...text.matchAll(
      /^[\t ]*import\s+(?:type\s+)?(?:[^'";]*?\s+from\s+)?['"]([^'"]+)['"]/gm,
    ),
    ...text.matchAll(
      /^[\t ]*export\s+(?:type\s+)?(?:\*|\{[^}]*\})\s+from\s+['"]([^'"]+)['"]/gm,
    ),
    ...text.matchAll(/^[\t ]*import\s*\(\s*['"]([^'"]+)['"]\s*\)/gm),
  ].map((match) => match[1]);
}

describe('PTBDocV4', () => {
  it('accepts ptb_4 documents only', () => {
    const doc = {
      version: 'ptb_4',
      graph: { nodes: [], edges: [] },
    };

    expect(parsePTBDocV4(doc)).toEqual(doc);
    expect(detectPTBDocVersion(doc)).toBe('ptb_4');
    expect(detectPTBDocVersion({ version: 'ptb_99' })).toBeUndefined();
  });

  it('returns a detached JSON-like ptb_4 document', () => {
    const doc = {
      version: 'ptb_4',
      graph: { nodes: [] as unknown[], edges: [] as unknown[] },
      modules: { pkg: { cached: true } },
      objects: { object: { type: '0x2::sui::SUI' } },
      view: { x: 0, y: 0, zoom: 1 },
    };

    const parsed = parsePTBDocV4(doc);

    expect(parsed).toEqual(doc);
    expect(parsed).not.toBe(doc);
    expect(parsed.graph).not.toBe(doc.graph);
    expect(parsed.modules).not.toBe(doc.modules);
    expect(parsed.objects).not.toBe(doc.objects);
    doc.graph.nodes.push({
      id: 'after-parse',
      kind: 'Start',
      ports: [],
    });
    (doc.modules.pkg as { cached: boolean }).cached = false;
    (doc.objects.object as { type: string }).type = 'mutated';

    expect(parsed.graph.nodes).toEqual([]);
    expect((parsed.modules?.pkg as { cached: boolean }).cached).toBe(true);
    expect((parsed.objects?.object as { type: string }).type).toBe(
      '0x2::sui::SUI',
    );
  });

  it('accepts shared acyclic document references and still rejects cycles', () => {
    const shared = { type: TEST_SUI_TYPE };
    const doc = {
      version: 'ptb_4',
      graph: { nodes: [], edges: [] },
      objects: {
        coinA: shared,
        coinB: shared,
      },
    };
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;

    const parsed = parsePTBDocV4(doc);

    expect(parsed.objects?.coinA).toEqual(shared);
    expect(parsed.objects?.coinB).toEqual(shared);
    expect(validatePTBDocV4(doc)).toEqual([]);
    expect(validatePTBDocV4({ ...doc, modules: cyclic })).toContainEqual(
      expect.objectContaining({ code: 'doc.json', path: '$.modules.self' }),
    );
  });

  it('rejects non-JSON document values at the parser boundary', () => {
    class FakeDoc {
      version = 'ptb_4';
      graph = { nodes: [], edges: [] };
    }

    const sparseNodes = [] as unknown[];
    sparseNodes[1] = { id: 'start', kind: 'Start', ports: [] };

    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;

    const cases = [
      { value: new FakeDoc(), path: '$' },
      {
        value: {
          version: 'ptb_4',
          graph: { nodes: [], edges: [] },
          modules: { nested: new FakeDoc() },
        },
        path: '$.modules.nested',
      },
      {
        value: {
          version: 'ptb_4',
          graph: { nodes: sparseNodes, edges: [] },
        },
        path: '$.graph.nodes',
      },
      {
        value: {
          version: 'ptb_4',
          graph: { nodes: [], edges: [] },
          modules: cyclic,
        },
        path: '$.modules.self',
      },
      {
        value: {
          version: 'ptb_4',
          graph: { nodes: [], edges: [] },
          modules: { missing: undefined },
        },
        path: '$.modules.missing',
      },
    ];

    cases.forEach(({ value, path }) => {
      const diagnostics = validatePTBDocV4(value);
      expect(diagnostics).toContainEqual(
        expect.objectContaining({ code: 'doc.json', path }),
      );
      expect(() => parsePTBDocV4(value)).toThrow(PTBModelError);
    });
  });

  it('parses deeply nested document embeds without recursive cloning', () => {
    const root: Record<string, unknown> = {};
    let cursor = root;
    for (let index = 0; index < 2000; index += 1) {
      const next: Record<string, unknown> = {};
      cursor.next = next;
      cursor = next;
    }
    cursor.done = true;

    const doc = {
      version: 'ptb_4',
      graph: { nodes: [], edges: [] },
      modules: root,
    };

    const parsed = parsePTBDocV4(doc);

    expect(parsed.modules).not.toBe(root);
    let parsedCursor = parsed.modules as Record<string, unknown>;
    for (let index = 0; index < 2000; index += 1) {
      parsedCursor = parsedCursor.next as Record<string, unknown>;
    }
    expect(parsedCursor.done).toBe(true);
  });

  it('rejects non-current document versions at the canonical boundary', () => {
    const diagnostics = validatePTBDocV4({
      version: 'ptb_old',
      graph: { nodes: [], edges: [] },
    });

    expect(diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'doc.version',
        path: '$.version',
      }),
    );
    expect(() =>
      parsePTBDocV4({
        version: 'ptb_old',
        graph: { nodes: [], edges: [] },
      }),
    ).toThrow(/version must be ptb_4/);
  });

  it('rejects malformed ptb_4 graph shape', () => {
    expect(() =>
      parsePTBDocV4({
        version: 'ptb_4',
        graph: { nodes: [], edges: {} },
      }),
    ).toThrow(/nodes and edges arrays/);
  });

  it('rejects malformed ptb_4 optional document fields', () => {
    const diagnostics = validatePTBDocV4({
      version: 'ptb_4',
      graph: { nodes: [], edges: [] },
      sender: 7,
      view: { x: '0', y: 0, zoom: 1 },
    });

    expect(diagnostics).toContainEqual(
      expect.objectContaining({ code: 'doc.sender', path: '$.sender' }),
    );
    expect(diagnostics).toContainEqual(
      expect.objectContaining({ code: 'doc.view', path: '$.view' }),
    );
  });

  it('requires canonical sender addresses when present', () => {
    expect(
      validatePTBDocV4({
        version: 'ptb_4',
        graph: { nodes: [], edges: [] },
        sender: normalizedObjectId('1'),
      }),
    ).toEqual([]);
    expect(
      validatePTBDocV4({
        version: 'ptb_4',
        graph: { nodes: [], edges: [] },
        sender: '0x1',
      }),
    ).toContainEqual(
      expect.objectContaining({ code: 'doc.sender', path: '$.sender' }),
    );
    expect(
      validatePTBDocV4({
        version: 'ptb_4',
        graph: { nodes: [], edges: [] },
        sender: 'garbage',
      }),
    ).toContainEqual(
      expect.objectContaining({ code: 'doc.sender', path: '$.sender' }),
    );
  });

  it('rejects unknown top-level document fields', () => {
    const diagnostics = validatePTBDocV4({
      version: 'ptb_4',
      graph: { nodes: [], edges: [] },
      extension: true,
      metadata: {},
    });

    expect(diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'doc.unknownField',
        path: '$.extension',
      }),
    );
    expect(diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'doc.unknownField',
        path: '$.metadata',
      }),
    );
  });

  it('rejects unknown PTB document view fields', () => {
    const diagnostics = validatePTBDocV4({
      version: 'ptb_4',
      graph: { nodes: [], edges: [] },
      view: { x: 0, y: 0, zoom: 1, extraViewField: true },
    });

    expect(diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'doc.view.unknownField',
        path: '$.view.extraViewField',
      }),
    );
  });

  it('rejects non-finite PTB document view numbers', () => {
    const diagnostics = validatePTBDocV4({
      version: 'ptb_4',
      graph: { nodes: [], edges: [] },
      view: { x: Number.NaN, y: 0, zoom: Number.POSITIVE_INFINITY },
    });

    expect(diagnostics).toContainEqual(
      expect.objectContaining({ code: 'doc.view', path: '$.view' }),
    );
  });

  it('rejects non-positive PTB document view zoom', () => {
    const diagnostics = validatePTBDocV4({
      version: 'ptb_4',
      graph: { nodes: [], edges: [] },
      view: { x: 0, y: 0, zoom: 0 },
    });

    expect(diagnostics).toContainEqual(
      expect.objectContaining({ code: 'doc.view', path: '$.view' }),
    );
  });

  it('rejects ptb_4 graphs with malformed node internals', () => {
    expect(() =>
      parsePTBDocV4({
        version: 'ptb_4',
        graph: {
          nodes: [
            {
              id: 'var-0',
              kind: 'Variable',
              name: 'missingType',
              ports: [{ id: 'out', direction: 'out', role: 'io' }],
            },
          ],
          edges: [],
        },
      }),
    ).toThrow(/PTB graph type/);
  });

  it('rejects ptb_4 graphs with dangling edge endpoints', () => {
    expect(() =>
      parsePTBDocV4({
        version: 'ptb_4',
        graph: {
          nodes: [
            {
              id: 'start',
              kind: 'Start',
              ports: [{ id: 'out', direction: 'out', role: 'flow' }],
            },
          ],
          edges: [
            {
              id: 'flow-start-missing',
              kind: 'flow',
              source: 'start',
              sourceHandle: 'out',
              target: 'missing',
              targetHandle: 'in',
            },
          ],
        },
      }),
    ).toThrow(/missing node/);
  });
});

describe('rawTransactionToIR', () => {
  it('covers canonical command and input variants', () => {
    const raw = sampleRawTransaction();
    const ir = rawTransactionToIR(raw);

    expect(ir.diagnostics).toEqual([]);
    expect(ir.inputs.map((input) => input.kind)).toEqual([
      'Pure',
      'Object',
      'FundsWithdrawal',
    ]);
    expect(ir.commands.map((command) => command.kind)).toEqual([
      'SplitCoins',
      'MergeCoins',
      'TransferObjects',
      'MoveCall',
      'MakeMoveVec',
      'Publish',
      'Upgrade',
    ]);
    expect(transactionIRToRaw(ir)).toEqual(raw);
  });

  it('normalizes SDK v2 $kind shapes', () => {
    const ir = rawTransactionToIR({
      inputs: [
        { $kind: 'Pure', Pure: { bytes: 'AQID' } },
        {
          $kind: 'Object',
          Object: {
            $kind: 'SharedObject',
            SharedObject: {
              objectId: '0x6',
              initialSharedVersion: '7',
              mutable: true,
            },
          },
        },
      ],
      commands: [
        {
          $kind: 'MakeMoveVec',
          MakeMoveVec: {
            type: NULL_VALUE,
            elements: [{ $kind: 'Input', Input: 1 }],
          },
        },
      ],
    });

    expect(ir.diagnostics).toEqual([]);
    expect(ir.inputs[1].kind).toBe('Object');
    expect(ir.commands[0].kind).toBe('MakeMoveVec');
  });

  it('rejects hidden fields in raw current-version structures', () => {
    const root = rawTransactionToIR({
      inputs: [{ kind: 'Pure', bytes: 'AQID' }],
      commands: [],
      extraRootField: true,
    });
    expect(root.diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'raw.transaction.unknownField',
        path: '$.extraRootField',
      }),
    );

    const input = rawTransactionToIR({
      inputs: [{ kind: 'Pure', bytes: 'AQID', extraInputField: true }],
      commands: [],
    });
    expect(input.inputs[0]).toMatchObject({ kind: 'Unsupported' });
    expect(input.diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'raw.input.unknownField',
        path: '$.inputs[0].extraInputField',
      }),
    );

    const command = rawTransactionToIR({
      inputs: [{ kind: 'Pure', bytes: 'AQID' }],
      commands: [
        {
          kind: 'Publish',
          modules: ['AQID'],
          dependencies: [],
          extraCommandField: true,
        },
      ],
    });
    expect(command.commands[0]).toMatchObject({ kind: 'Unsupported' });
    expect(command.diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'raw.command.unknownField',
        path: '$.commands[0].extraCommandField',
      }),
    );

    const argument = rawTransactionToIR({
      inputs: [{ kind: 'Pure', bytes: 'AQID' }],
      commands: [
        {
          kind: 'SplitCoins',
          coin: { kind: 'GasCoin', extraArgumentField: true },
          amounts: [{ kind: 'Input', index: 0 }],
        },
      ],
    });
    expect(argument.commands[0]).toMatchObject({ kind: 'Unsupported' });
    expect(argument.diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'raw.argument.unknownField',
        path: '$.commands[0].coin.extraArgumentField',
      }),
    );
  });

  it('preserves deeply nested unsupported raw values without recursive cloning', () => {
    const root: Record<string, unknown> = { kind: 'FutureInput' };
    let cursor = root;
    for (let index = 0; index < 10000; index += 1) {
      const next: Record<string, unknown> = {};
      cursor.next = next;
      cursor = next;
    }
    cursor.done = true;

    const ir = rawTransactionToIR({ inputs: [root], commands: [] });

    expect(ir.inputs[0].kind).toBe('Unsupported');
    if (ir.inputs[0].kind === 'Unsupported') {
      expect(ir.inputs[0].sourceKind).toBe('FutureInput');
      expect(Object.is(ir.inputs[0].value, root)).toBe(false);
      let cloned = ir.inputs[0].value as Record<string, unknown>;
      for (let index = 0; index < 10000; index += 1) {
        cloned = cloned.next as Record<string, unknown>;
      }
      expect(cloned.done).toBe(true);
    }
  });

  it('rejects non-current SDK TransactionData envelope versions', () => {
    const ir = rawTransactionToIR({
      version: 1,
      inputs: [],
      commands: [],
      sender: NULL_VALUE,
      expiration: NULL_VALUE,
      gasData: {
        budget: NULL_VALUE,
        price: NULL_VALUE,
        owner: NULL_VALUE,
        payment: NULL_VALUE,
      },
    });

    expect(ir.diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'raw.transaction.version',
        path: '$.version',
      }),
    );
  });

  it('normalizes canonical JsonU64 raw values to decimal strings', () => {
    const ir = rawTransactionToIR({
      inputs: [
        {
          kind: 'Object',
          object: {
            kind: 'ImmOrOwnedObject',
            objectId: '0x1',
            version: Number.MAX_SAFE_INTEGER,
            digest: TEST_DIGEST_1,
          },
        },
        {
          kind: 'Object',
          object: {
            kind: 'SharedObject',
            objectId: '0x2',
            initialSharedVersion: '16',
            mutable: true,
          },
        },
        {
          kind: 'Object',
          object: {
            kind: 'Receiving',
            objectId: '0x3',
            version: '18446744073709551615',
            digest: TEST_DIGEST_3,
          },
        },
        {
          kind: 'FundsWithdrawal',
          value: {
            reservation: { kind: 'MaxAmountU64', amount: 0 },
            typeArg: { kind: 'Balance', type: TEST_SUI_TYPE },
            withdrawFrom: { kind: 'Sender' },
          },
        },
      ],
      commands: [],
    });

    expect(ir.diagnostics).toEqual([]);
    expect(ir.inputs[0]).toMatchObject({
      kind: 'Object',
      object: {
        objectId: normalizedObjectId('1'),
        version: String(Number.MAX_SAFE_INTEGER),
      },
    });
    expect(ir.inputs[1]).toMatchObject({
      kind: 'Object',
      object: { initialSharedVersion: '16' },
    });
    expect(ir.inputs[2]).toMatchObject({
      kind: 'Object',
      object: { version: '18446744073709551615' },
    });
    expect(ir.inputs[3]).toMatchObject({
      kind: 'FundsWithdrawal',
      value: { reservation: { amount: '0' } },
    });
  });

  it('rejects values outside the SDK JsonU64 boundary', () => {
    const invalidValues: unknown[] = [
      '',
      '-1',
      '+1',
      '1.5',
      '1e3',
      '0x10',
      ' 100 ',
      '007',
      '18446744073709551616',
      Number.MAX_SAFE_INTEGER + 1,
      123n,
    ];

    invalidValues.forEach((version) => {
      const ir = rawTransactionToIR({
        inputs: [
          {
            kind: 'Object',
            object: {
              kind: 'ImmOrOwnedObject',
              objectId: '0x1',
              version,
              digest: TEST_DIGEST_1,
            },
          },
        ],
        commands: [],
      });

      expect(ir.diagnostics.map((diagnostic) => diagnostic.code)).toContain(
        'raw.object.ref',
      );
    });

    const funds = rawTransactionToIR({
      inputs: [
        {
          kind: 'FundsWithdrawal',
          value: {
            reservation: {
              kind: 'MaxAmountU64',
              amount: '18446744073709551616',
            },
            typeArg: { kind: 'Balance', type: TEST_SUI_TYPE },
            withdrawFrom: { kind: 'Sender' },
          },
        },
      ],
      commands: [],
    });

    expect(funds.diagnostics.map((diagnostic) => diagnostic.code)).toContain(
      'raw.funds.payload',
    );

    const leadingZeroFunds = rawTransactionToIR({
      inputs: [
        {
          kind: 'FundsWithdrawal',
          value: {
            reservation: { kind: 'MaxAmountU64', amount: '007' },
            typeArg: { kind: 'Balance', type: TEST_SUI_TYPE },
            withdrawFrom: { kind: 'Sender' },
          },
        },
      ],
      commands: [],
    });
    expect(
      leadingZeroFunds.diagnostics.map((diagnostic) => diagnostic.code),
    ).toContain('raw.funds.payload');
  });

  it('validates Sui object digests using the SDK base58 length rule', () => {
    expect(parseObjectDigest(TEST_DIGEST_1)).toBe(TEST_DIGEST_1);
    ['', 'a', '!@#%', '1'.repeat(10_000)].forEach((digest) => {
      expect(parseObjectDigest(digest)).toBeUndefined();
    });

    const ir = rawTransactionToIR({
      inputs: [
        {
          kind: 'Object',
          object: {
            kind: 'ImmOrOwnedObject',
            objectId: normalizedObjectId('1'),
            version: '1',
            digest: 'a',
          },
        },
      ],
      commands: [],
    });

    expect(ir.diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'raw.object.ref',
        path: '$.inputs[0].Object',
      }),
    );
  });

  it('validates and normalizes Move identifiers and type tags', () => {
    expect(parseMoveIdentifier('module_name')).toBe('module_name');
    expect(parseMoveIdentifier('_module')).toBe('_module');
    expect(parseMoveIdentifier('__init__')).toBe('__init__');
    expect(parseMoveIdentifier('a'.repeat(128))).toBe('a'.repeat(128));
    ['', ' ', '_', '2bad', 'bad-name', 'a'.repeat(129), '모듈'].forEach(
      (identifier) => {
        expect(parseMoveIdentifier(identifier)).toBeUndefined();
      },
    );

    expect(parseMoveTypeTag('u64')).toBe('u64');
    expect(parseMoveTypeTag('vector<0x2::sui::SUI>')).toBe(
      `vector<${TEST_SUI_TYPE}>`,
    );
    expect(parseMoveTypeTag('0x2::_module::__Struct')).toBe(
      `${normalizedObjectId('2')}::_module::__Struct`,
    );
    expect(parseMoveTypeTag('0x2::coin::Coin<u8, u64>')).toBe(
      `${TEST_COIN_TYPE}<u8, u64>`,
    );
    [
      '',
      ' ',
      '0x2:: ::SUI',
      'vector<>',
      '0x2::sui::SUI<>',
      '0x2::sui::SUI trailing',
      'u64extra',
      'signer',
      'vector<signer>',
    ].forEach((typeTag) => {
      expect(parseMoveTypeTag(typeTag)).toBeUndefined();
    });
  });

  it('returns diagnostics for excessively nested PTB types instead of throwing', () => {
    let type: PTBType = { kind: 'move_numeric', width: 'u8' };
    for (let index = 0; index < 80; index += 1) {
      type = { kind: 'vector', elem: type };
    }

    expect(validatePTBType(type)).toContainEqual(
      expect.objectContaining({ code: 'graph.type.depth' }),
    );
    expect(
      validateTransactionIR({
        version: 'transaction_ir_1',
        diagnostics: [],
        inputs: [{ id: 'deep', kind: 'Pure', value: [], type }],
        commands: [],
      }),
    ).toContainEqual(expect.objectContaining({ code: 'graph.type.depth' }));
  });

  it('validates raw base64 byte fields with SDK base64-compatible behavior', () => {
    ['', 'AQ==', 'AQI=', 'AQID', 'AQI', 'AQID\n', 'AB==', 'AQJ='].forEach(
      (bytes) => {
        expect(
          rawTransactionToIR({
            inputs: [{ kind: 'Pure', bytes }],
            commands: [],
          }).diagnostics,
        ).toEqual([]);
      },
    );

    const normalized = rawTransactionToIR({
      inputs: [{ kind: 'Pure', bytes: 'AQI\n' }],
      commands: [{ kind: 'Publish', modules: ['YQA '], dependencies: [] }],
    });

    expect(normalized.diagnostics).toEqual([]);
    expect(normalized.inputs[0]).toMatchObject({
      kind: 'Pure',
      bytes: 'AQI=',
    });
    expect(normalized.commands[0]).toMatchObject({
      kind: 'Publish',
      modules: ['YQA='],
    });

    ['A', '@@@', 'AQ-ID'].forEach((bytes) => {
      const ir = rawTransactionToIR({
        inputs: [{ kind: 'Pure', bytes }],
        commands: [],
      });

      expect(ir.diagnostics).toContainEqual(
        expect.objectContaining({
          code: 'raw.base64Bytes',
          path: '$.inputs[0].bytes',
        }),
      );
    });

    const atobDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'atob');
    Object.defineProperty(globalThis, 'atob', {
      configurable: true,
      value: undefined,
      writable: true,
    });
    try {
      expect(parseBase64Bytes('AQID')).toBe('AQID');
      expect(parseBase64Bytes('YQA')).toBe('YQA=');
      expect(parseBase64Bytes('@@@')).toBeUndefined();
      expect(
        validateTransactionIR({
          version: 'transaction_ir_1',
          diagnostics: [],
          inputs: [
            {
              id: 'flag',
              kind: 'Pure',
              bytes: 'Ag==',
              type: { kind: 'scalar', name: 'bool' },
            },
          ],
          commands: [],
        }),
      ).toContainEqual(
        expect.objectContaining({
          code: 'ir.input.pureBytesType',
          path: '$.inputs[0].bytes',
        }),
      );
    } finally {
      if (atobDescriptor) {
        Object.defineProperty(globalThis, 'atob', atobDescriptor);
      } else {
        delete (globalThis as { atob?: unknown }).atob;
      }
    }
  });

  it('reports invalid publish and upgrade module bytes at element paths', () => {
    const ir = rawTransactionToIR({
      inputs: [],
      commands: [
        {
          kind: 'Publish',
          modules: ['AQID', '@@@'],
          dependencies: [],
        },
        {
          kind: 'Upgrade',
          modules: ['AQ==', 'A'],
          dependencies: [],
          package: '0x1',
          ticket: { kind: 'GasCoin' },
        },
      ],
    });

    expect(ir.diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'raw.base64Bytes',
        path: '$.commands[0].modules[1]',
      }),
    );
    expect(ir.diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'raw.base64Bytes',
        path: '$.commands[1].modules[1]',
      }),
    );
  });

  it('clones unsupported raw payloads before storing them in IR', () => {
    const input: Record<string, unknown> = { kind: 'FutureInput' };
    input.self = input;
    const command: Record<string, unknown> = { kind: 'FutureCommand' };
    command.self = command;

    const ir = rawTransactionToIR({
      inputs: [input],
      commands: [command],
    });

    const irInput = ir.inputs[0];
    const irCommand = ir.commands[0];
    if (irInput.kind !== 'Unsupported' || irCommand.kind !== 'Unsupported') {
      throw new Error('Expected unsupported raw values');
    }

    expect(irInput.value).not.toBe(input);
    expect(irCommand.value).not.toBe(command);
    expect((irInput.value as { self?: unknown }).self).toBe(irInput.value);
    expect((irCommand.value as { self?: unknown }).self).toBe(irCommand.value);

    input.extra = 'mutated';
    command.extra = 'mutated';
    expect((irInput.value as { extra?: unknown }).extra).toBeUndefined();
    expect((irCommand.value as { extra?: unknown }).extra).toBeUndefined();
  });

  it('stores normalized raw PTB origin payloads as canonicalRaw in IR', () => {
    const raw = sampleRawTransaction();
    const ir = rawTransactionToIR(raw);

    expect(ir.inputs[0]).toHaveProperty('canonicalRaw');
    expect(ir.inputs[0]).not.toHaveProperty('raw');
    expect(ir.commands[0]).toHaveProperty('canonicalRaw');
    expect(ir.commands[0]).not.toHaveProperty('raw');

    const diagnostics = validateTransactionIR({
      version: 'transaction_ir_1',
      diagnostics: [],
      inputs: [
        {
          id: 'old_raw_field',
          kind: 'Pure',
          bytes: 'AQID',
          raw: { kind: 'Pure', bytes: 'AQID' },
        } as never,
      ],
      commands: [],
    });

    expect(diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'ir.input.unknownField',
        path: '$.inputs[0].raw',
      }),
    );
  });

  it('preserves Receiving object inputs across raw, graph, Mermaid, and code renderers', () => {
    const raw: RawProgrammableTransaction = {
      inputs: [
        {
          kind: 'Object',
          object: {
            kind: 'Receiving',
            objectId: normalizedObjectId('8'),
            version: '9',
            digest: TEST_DIGEST_2,
          },
        },
        { kind: 'Pure', bytes: 'AQID' },
      ],
      commands: [
        {
          kind: 'MoveCall',
          call: {
            package: normalizedObjectId('2'),
            module: 'transfer',
            function: 'receive',
            typeArguments: [],
            arguments: [
              { kind: 'Input', index: 0 },
              { kind: 'Input', index: 1 },
            ],
          },
        },
      ],
    };

    const ir = rawTransactionToIR(raw);
    const graph = transactionIRToGraph(ir);
    const roundTripped = graphToTransactionIR(graph);
    const mermaid = transactionIRToMermaid(ir, { showArgumentValues: true });
    const code = transactionIRToTsSdkCode(ir);

    expect(ir.diagnostics).toEqual([]);
    expect(ir.inputs[0]).toMatchObject({
      kind: 'Object',
      object: { kind: 'Receiving' },
    });
    expect(transactionIRToRaw(ir)).toEqual(raw);
    expect(graphEdgesHaveDeclaredHandles(graph)).toBe(true);
    expect(roundTripped.diagnostics).toEqual([]);
    expect(transactionIRToRaw(roundTripped)).toEqual(raw);
    expect(mermaid).toContain(
      'receiving 0x00000000...000008 v9 7msXn7aieHy73WkRxh3Xdqh9PEoPY...',
    );
    expect(code).toContain('tx.receivingRef');
  });

  it('normalizes SDK v2 NestedResult tuple arguments', () => {
    const ir = rawTransactionToIR({
      inputs: [{ $kind: 'Pure', Pure: { bytes: 'AQID' } }],
      commands: [
        {
          $kind: 'SplitCoins',
          SplitCoins: {
            coin: { $kind: 'GasCoin', GasCoin: true },
            amounts: [{ $kind: 'Input', Input: 0 }],
          },
        },
        {
          $kind: 'MoveCall',
          MoveCall: {
            package: '0x2',
            module: 'coin',
            function: 'value',
            typeArguments: [],
            arguments: [{ $kind: 'NestedResult', NestedResult: [0, 0] }],
          },
        },
      ],
    });
    const graph = transactionIRToGraph(ir);

    expect(ir.diagnostics).toEqual([]);
    expect(ir.commands[1].kind).toBe('MoveCall');
    if (ir.commands[1].kind !== 'MoveCall') {
      throw new Error('Expected MoveCall');
    }
    expect(ir.commands[1].arguments[0]).toEqual({
      kind: 'NestedResult',
      commandIndex: 0,
      resultIndex: 0,
    });
    expect(transactionIRToMermaid(ir)).toContain('gas["GasCoin"]');
    expect(graphEdgesHaveDeclaredHandles(graph)).toBe(true);
  });

  it('preserves SDK Input.type and MoveCall _argumentTypes metadata', () => {
    const ir = rawTransactionToIR({
      inputs: [{ $kind: 'Pure', Pure: { bytes: 'AA==' } }],
      commands: [
        {
          $kind: 'MoveCall',
          MoveCall: {
            package: '0x2',
            module: 'module',
            function: 'call',
            typeArguments: [],
            arguments: [{ $kind: 'Input', Input: 0, type: 'pure' }],
            _argumentTypes: [{ reference: NULL_VALUE, body: { $kind: 'u64' } }],
          },
        },
      ],
    });

    expect(ir.diagnostics).toEqual([]);
    expect(ir.commands[0]).toMatchObject({
      kind: 'MoveCall',
      _argumentTypes: [{ reference: NULL_VALUE, body: { $kind: 'u64' } }],
    });
    expect(transactionIRToRaw(ir).commands[0]).toMatchObject({
      kind: 'MoveCall',
      call: {
        arguments: [{ kind: 'Input', index: 0, type: 'pure' }],
        _argumentTypes: [{ reference: NULL_VALUE, body: { $kind: 'u64' } }],
      },
    });
  });

  it('requires MoveCall _argumentTypes to align with arguments', () => {
    const diagnostics = validateTransactionIR({
      version: 'transaction_ir_1',
      diagnostics: [],
      inputs: [{ id: 'input_0', kind: 'Pure', bytes: 'AA==' }],
      commands: [
        {
          id: 'command_0',
          kind: 'MoveCall',
          package: normalizedObjectId('2'),
          module: 'module',
          function: 'call',
          typeArguments: [],
          arguments: [{ kind: 'Input', index: 0 }],
          _argumentTypes: [
            { reference: NULL_VALUE, body: { $kind: 'u64' } },
            { reference: NULL_VALUE, body: { $kind: 'bool' } },
          ],
        },
      ],
    });

    expect(diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'ir.command.argumentTypesLength',
        path: '$.commands[0]._argumentTypes',
      }),
    );
  });

  it('rejects MoveCall _argumentTypes outside the SDK OpenSignature schema', () => {
    const ir = rawTransactionToIR({
      inputs: [],
      commands: [
        {
          kind: 'MoveCall',
          call: {
            package: '0x2',
            module: 'module',
            function: 'call',
            typeArguments: [],
            arguments: [],
            _argumentTypes: [{ reference: NULL_VALUE, body: { $kind: 'u64' } }],
          },
        },
        {
          kind: 'MoveCall',
          call: {
            package: '0x2',
            module: 'module',
            function: 'call',
            typeArguments: [],
            arguments: [],
            _argumentTypes: [
              { reference: 'mutable', body: { $kind: 'future' } },
            ],
          },
        },
      ],
    });

    expect(ir.commands[0]).toMatchObject({ kind: 'MoveCall' });
    expect(ir.commands[1]).toMatchObject({
      kind: 'Unsupported',
      sourceKind: 'MoveCall',
    });
    expect(ir.diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'raw.command.moveCall.argumentTypes',
        path: '$.commands[1]._argumentTypes',
      }),
    );
  });

  it('rejects MoveCall _argumentTypes with unsupported hidden fields', () => {
    const ir = rawTransactionToIR({
      inputs: [],
      commands: [
        {
          kind: 'MoveCall',
          call: {
            package: '0x2',
            module: 'module',
            function: 'call',
            typeArguments: [],
            arguments: [],
            _argumentTypes: [
              {
                reference: NULL_VALUE,
                body: { $kind: 'u64', hiddenBodyField: true },
                hiddenSignatureField: true,
              },
            ],
          },
        },
      ],
    });

    expect(ir.commands[0]).toMatchObject({
      kind: 'Unsupported',
      sourceKind: 'MoveCall',
    });
    expect(ir.diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'raw.command.moveCall.argumentTypes',
        path: '$.commands[0]._argumentTypes',
      }),
    );
  });

  it('rejects excessively nested MoveCall _argumentTypes without throwing', () => {
    let body: Record<string, unknown> = { $kind: 'u64' };
    for (let index = 0; index < 80; index += 1) {
      body = { $kind: 'vector', vector: body };
    }

    const ir = rawTransactionToIR({
      inputs: [],
      commands: [
        {
          kind: 'MoveCall',
          call: {
            package: '0x2',
            module: 'module',
            function: 'call',
            typeArguments: [],
            arguments: [],
            _argumentTypes: [{ reference: NULL_VALUE, body }],
          },
        },
      ],
    });

    expect(ir.commands[0]).toMatchObject({
      kind: 'Unsupported',
      sourceKind: 'MoveCall',
    });
    expect(ir.diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'raw.command.moveCall.argumentTypes',
        path: '$.commands[0]._argumentTypes',
      }),
    );
  });

  it('rejects manual IR MoveCall _argumentTypes with unsupported hidden fields', () => {
    const diagnostics = validateTransactionIR({
      version: 'transaction_ir_1',
      inputs: [],
      commands: [
        {
          id: 'call',
          kind: 'MoveCall',
          package: normalizedObjectId('2'),
          module: 'module',
          function: 'call',
          typeArguments: [],
          arguments: [],
          _argumentTypes: [
            {
              reference: NULL_VALUE,
              body: {
                $kind: 'datatype',
                datatype: {
                  typeName: '0x2::m::T',
                  typeParameters: [],
                  hiddenDatatypeField: true,
                },
              },
            },
          ],
          resultCount: 0,
        },
      ],
      diagnostics: [],
    });

    expect(diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'ir.command.argumentTypes',
        path: '$.commands[0]._argumentTypes',
      }),
    );
  });

  it('rejects negative MoveCall _argumentTypes type parameter indexes', () => {
    const ir = rawTransactionToIR({
      inputs: [],
      commands: [
        {
          kind: 'MoveCall',
          call: {
            package: '0x2',
            module: 'module',
            function: 'call',
            typeArguments: [],
            arguments: [],
            _argumentTypes: [
              {
                reference: NULL_VALUE,
                body: { $kind: 'typeParameter', index: -1 },
              },
            ],
          },
        },
      ],
    });

    expect(ir.commands[0]).toMatchObject({
      kind: 'Unsupported',
      sourceKind: 'MoveCall',
    });
    expect(ir.diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'raw.command.moveCall.argumentTypes',
        path: '$.commands[0]._argumentTypes',
      }),
    );
  });

  it('diagnoses SDK builder convenience shapes', () => {
    const ir = rawTransactionToIR({
      inputs: [{ $kind: 'UnresolvedPure', UnresolvedPure: { value: 1 } }],
      commands: [
        {
          $kind: '$Intent',
          $Intent: { name: 'CoinWithBalance', inputs: {}, data: {} },
        },
      ],
    });

    expect(ir.diagnostics.map((diagnostic) => diagnostic.code)).toContain(
      'raw.input.unresolved',
    );
    expect(ir.diagnostics.map((diagnostic) => diagnostic.code)).toContain(
      'raw.command.intent',
    );
  });

  it('diagnoses conflicting raw enum discriminators', () => {
    const ir = rawTransactionToIR({
      inputs: [
        {
          kind: 'Object',
          object: {
            kind: 'SharedObject',
            $kind: 'ImmOrOwnedObject',
            objectId: normalizedObjectId('2'),
            initialSharedVersion: '1',
            mutable: true,
          },
        },
      ],
      commands: [
        {
          kind: 'Publish',
          $kind: 'Upgrade',
          modules: ['AQID'],
          dependencies: [],
        },
      ],
    });

    expect(ir.diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'raw.enum.conflict',
        path: '$.inputs[0].Object',
      }),
    );
    expect(ir.diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'raw.enum.conflict',
        path: '$.commands[0]',
      }),
    );
  });

  it('rejects invalid raw MoveCall identifiers and type tags', () => {
    const ir = rawTransactionToIR({
      inputs: [],
      commands: [
        {
          kind: 'MoveCall',
          call: {
            package: normalizedObjectId('2'),
            module: ' ',
            function: 'call',
            typeArguments: [],
            arguments: [],
          },
        },
        {
          kind: 'MoveCall',
          call: {
            package: normalizedObjectId('2'),
            module: 'module',
            function: 'call',
            typeArguments: [''],
            arguments: [],
          },
        },
      ],
    });

    expect(ir.commands[0]).toMatchObject({
      kind: 'Unsupported',
      sourceKind: 'MoveCall',
    });
    expect(ir.commands[1]).toMatchObject({
      kind: 'Unsupported',
      sourceKind: 'MoveCall',
    });
    expect(ir.diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'raw.moveIdentifier',
        path: '$.commands[0].module',
      }),
    );
    expect(ir.diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'raw.moveTypeTag',
        path: '$.commands[1].typeArguments[0]',
      }),
    );
  });

  it('rejects unknown fields in raw object and funds withdrawal payloads', () => {
    const ir = rawTransactionToIR({
      inputs: [
        {
          kind: 'Object',
          object: {
            kind: 'ImmOrOwnedObject',
            objectId: normalizedObjectId('2'),
            version: '1',
            digest: TEST_DIGEST_1,
            extraObjectField: true,
          },
        },
        {
          kind: 'FundsWithdrawal',
          value: {
            reservation: {
              kind: 'MaxAmountU64',
              amount: '1',
              extraReservationField: true,
            },
            typeArg: { kind: 'Balance', type: TEST_SUI_TYPE },
            withdrawFrom: { kind: 'Sender' },
            extraFundsField: true,
          },
        },
      ],
      commands: [],
    });

    expect(ir.diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'raw.object.unknownField',
        path: '$.inputs[0].Object.extraObjectField',
      }),
    );
    expect(ir.diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'raw.funds.unknownField',
        path: '$.inputs[1].FundsWithdrawal.extraFundsField',
      }),
    );
  });

  it('diagnoses unresolved objects preserved by SDK Transaction serialization', () => {
    const tx = new Transaction();
    tx.transferObjects(
      [tx.object('0x2')],
      tx.pure.address(normalizedObjectId('3')),
    );

    const restored = Transaction.from(tx.serialize());
    const ir = rawTransactionToIR(restored.getData());

    expect(restored.getData().inputs[0]).toMatchObject({
      $kind: 'UnresolvedObject',
    });
    expect(ir.diagnostics.map((diagnostic) => diagnostic.code)).toContain(
      'raw.input.unresolved',
    );
  });

  it('converts current data snapshots from a live SDK Transaction object', () => {
    const tx = new Transaction();
    tx.moveCall({
      package: normalizedObjectId('2'),
      module: 'coin',
      function: 'zero',
      typeArguments: [`${normalizedObjectId('2')}::sui::SUI`],
      arguments: [],
    });

    const ir = rawTransactionToIR(tx.getData());
    const mermaid = transactionIRToMermaid(ir, {
      direction: 'LR',
      showArgumentValues: true,
      theme: 'semantic',
    });

    expect(ir.diagnostics).toEqual([]);
    expect(ir.commands[0]).toMatchObject({
      kind: 'MoveCall',
      package: normalizedObjectId('2'),
      module: 'coin',
      function: 'zero',
    });
    expect(mermaid).toContain('flowchart LR');
    expect(mermaid).toContain(
      `MoveCall ${normalizedObjectId('2')}::coin::zero`,
    );
  });

  it('converts locally built resolved transaction-kind data', async () => {
    const tx = new Transaction();
    tx.moveCall({
      package: normalizedObjectId('2'),
      module: 'coin',
      function: 'zero',
      typeArguments: [`${normalizedObjectId('2')}::sui::SUI`],
      arguments: [],
    });

    const bytes = await tx.build({ onlyTransactionKind: true });
    const restored = Transaction.fromKind(bytes);
    const ir = rawTransactionToIR(restored.getData());

    expect(ir.diagnostics).toEqual([]);
    expect(ir.commands[0]).toMatchObject({
      kind: 'MoveCall',
      package: normalizedObjectId('2'),
      module: 'coin',
      function: 'zero',
    });
    expect(transactionIRToRaw(ir).commands[0]).toMatchObject({
      kind: 'MoveCall',
      call: {
        package: normalizedObjectId('2'),
        module: 'coin',
        function: 'zero',
      },
    });
  });

  it('diagnoses malformed command payload fields instead of only falling back to unsupported', () => {
    const ir = rawTransactionToIR({
      inputs: [],
      commands: [
        {
          kind: 'Publish',
          modules: ['AAEC'],
          dependencies: [1],
        },
        {
          kind: 'MakeMoveVec',
          type: { kind: 'u64' },
          elements: [],
        },
        {
          kind: 'MakeMoveVec',
          elements: [{ kind: 'GasCoin' }],
        },
        {
          kind: 'Upgrade',
          modules: ['AAEC'],
          dependencies: ['0x1'],
          ticket: { kind: 'GasCoin' },
        },
      ],
    });

    const codes = ir.diagnostics.map((diagnostic) => diagnostic.code);
    expect(codes).toContain('raw.objectId');
    expect(codes).toContain('raw.command.makeMoveVec.type');
    expect(codes).toContain('raw.command.upgrade.package');
  });

  it('rejects non-canonical Upgrade packageId raw fields at the parser boundary', () => {
    const ir = rawTransactionToIR({
      inputs: [],
      commands: [
        {
          kind: 'Upgrade',
          modules: ['AAEC'],
          dependencies: [],
          packageId: '0x1',
          ticket: { kind: 'GasCoin' },
        },
      ],
    });

    expect(ir.diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'raw.command.unknownField',
        path: '$.commands[0].packageId',
      }),
    );
  });

  it('diagnoses Sui command validity empty-input cases from raw PTB', () => {
    const ir = rawTransactionToIR({
      inputs: [{ kind: 'Pure', bytes: 'AQID' }],
      commands: [
        {
          kind: 'TransferObjects',
          objects: [],
          address: { kind: 'Input', index: 0 },
        },
        {
          kind: 'SplitCoins',
          coin: { kind: 'GasCoin' },
          amounts: [],
        },
        {
          kind: 'MergeCoins',
          destination: { kind: 'GasCoin' },
          sources: [],
        },
        {
          kind: 'MakeMoveVec',
          type: NULL_VALUE,
          elements: [],
        },
        {
          kind: 'Publish',
          modules: [],
          dependencies: [],
        },
        {
          kind: 'Upgrade',
          modules: [],
          dependencies: [],
          package: '0x1',
          ticket: { kind: 'GasCoin' },
        },
      ],
    });

    expect(
      ir.diagnostics.filter(
        (diagnostic) => diagnostic.code === 'raw.command.emptyInput',
      ),
    ).toHaveLength(6);
  });

  it('rejects raw conversion for unsupported IR commands', () => {
    const ir: TransactionIR = {
      version: 'transaction_ir_1',
      diagnostics: [],
      inputs: [],
      commands: [
        {
          id: 'command_0',
          kind: 'Unsupported',
          sourceKind: 'FutureCommand',
          resultCount: 0,
        },
      ],
    };

    expect(() => transactionIRToRaw(ir)).toThrow(
      /cannot be converted to raw PTB/,
    );
  });

  it('emits the SDK canonical Upgrade package field in raw conversion', () => {
    const raw = transactionIRToRaw(rawTransactionToIR(sampleRawTransaction()));
    const upgrade = raw.commands.find((command) => command.kind === 'Upgrade');

    if (!upgrade || upgrade.kind !== 'Upgrade') {
      throw new Error('Expected Upgrade command');
    }

    expect(upgrade.package).toBe(normalizedObjectId('9'));
    expect('packageId' in upgrade).toBe(false);
  });
});

describe('TransactionIR renderers', () => {
  it('generates deterministic Mermaid from IR', () => {
    const mermaid = transactionIRToMermaid(
      rawTransactionToIR(sampleRawTransaction()),
    );

    expect(mermaid).toContain('flowchart TD');
    expect(mermaid).toContain('Input 0: Pure');
    expect(mermaid).toContain('gas["GasCoin"]');
    expect(mermaid).toContain('gas --> command0');
    expect(mermaid).toContain('SplitCoins');
  });

  it('can render Mermaid left-to-right or top-down', () => {
    const ir = rawTransactionToIR(sampleRawTransaction());

    expect(transactionIRToMermaid(ir)).toMatch(/^flowchart TD/);
    expect(transactionIRToMermaid(ir, { direction: 'TD' })).toMatch(
      /^flowchart TD/,
    );
    expect(transactionIRToMermaid(ir, { direction: 'LR' })).toMatch(
      /^flowchart LR/,
    );
    expect(() =>
      transactionIRToMermaid(ir, { direction: 'BT' as never }),
    ).toThrow(/TD or LR/);
    expectModelErrorCodes(
      () => transactionIRToMermaid(ir, { showArgumentValues: 'yes' as never }),
      ['mermaid.showArgumentValues'],
    );
    expectModelErrorCodes(
      () => transactionIRToMermaid(ir, { showArgsValues: true } as never),
      ['mermaid.options.unknownField'],
    );
    expectModelErrorCodes(
      () => transactionIRToMermaid(ir, NULL_VALUE as never),
      ['mermaid.options'],
    );
  });

  it('renders validation diagnostics in Mermaid for invalid manual IR', () => {
    const mermaid = transactionIRToMermaid({
      version: 'transaction_ir_1',
      diagnostics: [],
      inputs: [],
      commands: [
        {
          id: 'command_0',
          kind: 'MoveCall',
          package: normalizedObjectId('2'),
          module: 'm',
          function: 'f',
          typeArguments: [],
          arguments: [{ kind: 'Input', index: Number.NaN }],
        },
      ],
    });

    expect(mermaid).toContain('ir.arg.input');
    expect(mermaid).not.toContain('inputNaN');
  });

  it('renders malformed manual IR diagnostics in Mermaid without TypeError', () => {
    const mermaid = transactionIRToMermaid(
      {
        version: 'transaction_ir_1',
        diagnostics: [],
        inputs: [NULL_VALUE],
        commands: [
          {
            id: 'command_0',
            kind: 'MoveCall',
            package: normalizedObjectId('2'),
            module: 'm',
            function: 'f',
            typeArguments: [],
          },
        ],
      } as never,
      { showArgumentValues: true },
    );

    expect(mermaid).toContain('ir.input');
    expect(mermaid).toContain('ir.command.field');
    expect(mermaid).toContain('Input 0: Invalid<br/>invalid input');
    expect(mermaid).toContain(`MoveCall ${normalizedObjectId('2')}::m::f`);
  });

  it('can render Mermaid argument value summaries and semantic colors', () => {
    const mermaid = transactionIRToMermaid(
      rawTransactionToIR(sampleRawTransaction()),
      { showArgumentValues: true, theme: 'semantic' },
    );

    expect(mermaid).toContain('Input 0: Pure<br/>bytes AQID');
    expect(mermaid).toContain('Input 2: FundsWithdrawal<br/>withdraw 1000');
    expect(mermaid).toContain('input0 -- "input 0: bytes AQID" --> command0');
    expect(mermaid).toContain('command0 -- "result command 0[0]" --> command1');
    expect(mermaid).toContain('classDef input fill:#eff6ff');
    expect(mermaid).toContain('class command0,command1 coin');
  });

  it('renders Mermaid labels through one escape path for HTML and control characters', () => {
    const mermaid = transactionIRToMermaid(
      {
        version: 'transaction_ir_1',
        inputs: [
          {
            id: 'maybeAmount',
            kind: 'Pure',
            value:
              'line\nnext\t\u202E\u200B\uD800\u2028\u2029\u0080\u009F\uD83C\uDF89',
            type: { kind: 'scalar', name: 'string' },
          },
          {
            id: 'none',
            kind: 'Pure',
            value: NULL_VALUE,
            type: {
              kind: 'option',
              elem: { kind: 'move_numeric', width: 'u64' },
            },
          },
        ],
        diagnostics: [],
        commands: [
          {
            id: 'command_0',
            kind: 'MoveCall',
            package: normalizedObjectId('2'),
            module: 'mod"ule<',
            function: 'f',
            typeArguments: [],
            arguments: [{ kind: 'Input', index: 0 }],
          },
        ],
      },
      { showArgumentValues: true },
    );

    expect(mermaid).toContain(
      'Input 0: Pure<br/>value line<br/>next [U+202E][U+200B][U+D800][U+2028][U+2029][U+0080][U+009F]\uD83C\uDF89',
    );
    expect(mermaid).toContain('Input 1: Pure<br/>value null');
    expect(mermaid).toContain(
      `MoveCall ${normalizedObjectId('2')}::mod&quot;ule&lt;::f`,
    );
    expect(mermaid).toContain(
      'input0 -- "input 0: value line<br/>next [U+202E][U+200B][U+D800][U+2028][U+2029][U+0080][U+009F]\uD83C\uDF89" --> command0',
    );
  });

  it('preserves nested pure value structure in Mermaid value labels', () => {
    const mermaid = transactionIRToMermaid(
      {
        version: 'transaction_ir_1',
        inputs: [
          {
            id: 'nested',
            kind: 'Pure',
            value: [
              [1, 2],
              [3, 4],
            ],
            type: {
              kind: 'vector',
              elem: {
                kind: 'vector',
                elem: { kind: 'move_numeric', width: 'u8' },
              },
            },
          },
        ],
        diagnostics: [],
        commands: [],
      },
      { showArgumentValues: true },
    );

    expect(mermaid).toContain('Input 0: Pure<br/>value [[1,2],[3,4]]');
    expect(mermaid).not.toContain('value 1,2,3,4');
  });

  it('generates SDK 2.16.2 style transaction code', () => {
    const code = transactionIRToTsSdkCode(
      rawTransactionToIR(
        sampleRawTransaction({ fundsWithdrawalFrom: 'Sender' }),
      ),
    );

    expect(code).toContain(`from '@mysten/sui/transactions'`);
    expect(code).toContain('new Transaction()');
    expect(code).toContain('tx.splitCoins');
    expect(code).toContain('tx.objectRef');
    expect(code).toContain('tx.withdrawal');
    expect(code).toContain('"amount":"1000"');
    expect(code).not.toContain(`@mysten/sui/${'jsonRpc'}`);
    expect(code).not.toContain('Buffer');
    expectValidTypeScriptSource(code);
  });

  it('generates syntactically valid SDK code for object and withdrawal helpers', () => {
    const code = transactionIRToTsSdkCode({
      version: 'transaction_ir_1',
      diagnostics: [],
      inputs: [
        {
          id: 'owned',
          kind: 'Object',
          object: {
            kind: 'ImmOrOwnedObject',
            objectId: normalizedObjectId('1'),
            version: '1',
            digest: TEST_DIGEST_1,
          },
        },
        {
          id: 'shared',
          kind: 'Object',
          object: {
            kind: 'SharedObject',
            objectId: normalizedObjectId('2'),
            initialSharedVersion: '2',
            mutable: false,
          },
        },
        {
          id: 'receiving',
          kind: 'Object',
          object: {
            kind: 'Receiving',
            objectId: normalizedObjectId('3'),
            version: '3',
            digest: TEST_DIGEST_2,
          },
        },
        {
          id: 'withdrawal',
          kind: 'FundsWithdrawal',
          value: {
            reservation: { kind: 'MaxAmountU64', amount: '4' },
            typeArg: { kind: 'Balance', type: TEST_SUI_TYPE },
            withdrawFrom: { kind: 'Sender' },
          },
        },
      ],
      commands: [],
    });

    expect(code).toContain(
      `tx.objectRef({"objectId":"${normalizedObjectId('1')}"`,
    );
    expect(code).toContain(
      `tx.sharedObjectRef({"objectId":"${normalizedObjectId('2')}"`,
    );
    expect(code).toContain(
      `tx.receivingRef({"objectId":"${normalizedObjectId('3')}"`,
    );
    expect(code).toContain('tx.withdrawal({"amount":"4"');
    expectValidTypeScriptSource(code);
  });

  it('rejects SDK code generation for sponsor FundsWithdrawal instead of emitting unsafe code', () => {
    const ir = rawTransactionToIR(sampleRawTransaction());

    expectModelErrorCodes(
      () => transactionIRToTsSdkCode(ir),
      ['codegen.input.fundsWithdrawalSponsor'],
    );
  });

  it('rejects SDK code generation for unsupported commands instead of emitting comments', () => {
    const ir: TransactionIR = {
      version: 'transaction_ir_1',
      diagnostics: [],
      inputs: [],
      commands: [
        {
          id: 'command_0',
          kind: 'Unsupported',
          sourceKind: 'FutureCommand',
          resultCount: 0,
        },
      ],
    };

    expect(() => transactionIRToTsSdkCode(ir)).toThrow(
      /cannot be rendered to TS SDK code/,
    );
  });

  it('renders typed pure values only when the type is supported by the SDK pure API', () => {
    const ir: TransactionIR = {
      version: 'transaction_ir_1',
      diagnostics: [],
      inputs: [
        {
          id: 'amount',
          kind: 'Pure',
          value: '42',
          type: { kind: 'move_numeric', width: 'u64' },
        },
      ],
      commands: [
        {
          id: 'command_0',
          kind: 'SplitCoins',
          coin: { kind: 'GasCoin' },
          amounts: [{ kind: 'Input', index: 0 }],
          resultCount: 1,
        },
      ],
    };

    const code = transactionIRToTsSdkCode(ir);

    expect(code).toContain('tx.pure("u64", "42")');
    expect(code).not.toContain('fromBase64');
    expectValidTypeScriptSource(code);
  });

  it('escapes invisible and separator characters in generated SDK code literals', () => {
    const unsafe =
      'line1\u2028line2\u2029x\u0080y\u009Fz\u007F\u202E\u200B\u2066\uFEFF';
    const ir: TransactionIR = {
      version: 'transaction_ir_1',
      diagnostics: [],
      inputs: [
        {
          id: 'plain',
          kind: 'Pure',
          value: unsafe,
          type: { kind: 'scalar', name: 'string' },
        },
        {
          id: 'vector',
          kind: 'Pure',
          value: ['a\u2028b', 'safe'],
          type: {
            kind: 'vector',
            elem: { kind: 'scalar', name: 'string' },
          },
        },
        {
          id: 'option',
          kind: 'Pure',
          value: 'c\u2029d',
          type: {
            kind: 'option',
            elem: { kind: 'scalar', name: 'string' },
          },
        },
      ],
      commands: [
        {
          id: 'command_0',
          kind: 'MoveCall',
          package: normalizedObjectId('2'),
          module: 'm',
          function: 'f',
          typeArguments: [],
          arguments: [{ kind: 'Input', index: 0 }],
        },
      ],
    };

    const code = transactionIRToTsSdkCode(ir);

    expect(code).toContain(
      'tx.pure("string", "line1\\u2028line2\\u2029x\\u0080y\\u009Fz\\u007F\\u202E\\u200B\\u2066\\uFEFF")',
    );
    expect(code).toContain('tx.pure("vector<string>", ["a\\u2028b","safe"])');
    expect(code).toContain('tx.pure.option("string", "c\\u2029d")');
    [
      '\u007F',
      '\u0080',
      '\u009F',
      '\u200B',
      '\u2028',
      '\u2029',
      '\u202E',
      '\u2066',
      '\uFEFF',
    ].forEach((char) => {
      expect(code).not.toContain(char);
    });
    expectValidTypeScriptSource(code);
  });

  it('rejects typed pure integer values outside SDK BCS numeric ranges', () => {
    const cases: Array<{
      width: 'u64' | 'u128' | 'u256';
      value: string;
    }> = [
      { width: 'u64', value: '18446744073709551616' },
      {
        width: 'u128',
        value: '340282366920938463463374607431768211456',
      },
      {
        width: 'u256',
        value:
          '115792089237316195423570985008687907853269984665640564039457584007913129639936',
      },
    ];

    cases.forEach(({ width, value }) => {
      const ir: TransactionIR = {
        version: 'transaction_ir_1',
        diagnostics: [],
        inputs: [
          {
            id: 'amount',
            kind: 'Pure',
            value,
            type: { kind: 'move_numeric', width },
          },
        ],
        commands: [],
      };

      expectModelErrorCodes(
        () => transactionIRToTsSdkCode(ir),
        ['ir.input.pureValue'],
      );
    });
  });

  it('renders canonical option None values through the SDK option helper', () => {
    const ir: TransactionIR = {
      version: 'transaction_ir_1',
      diagnostics: [],
      inputs: [
        {
          id: 'maybeAmount',
          kind: 'Pure',
          value: NULL_VALUE,
          type: {
            kind: 'option',
            elem: { kind: 'move_numeric', width: 'u64' },
          },
        },
      ],
      commands: [],
    };

    const code = transactionIRToTsSdkCode(ir);

    expect(code).toContain('tx.pure.option("u64", null)');
    expectValidTypeScriptSource(code);
  });

  it('rejects undefined option None values at the canonical IR boundary', () => {
    const ir: TransactionIR = {
      version: 'transaction_ir_1',
      diagnostics: [],
      inputs: [
        {
          id: 'maybeAmount',
          kind: 'Pure',
          value: undefined as never,
          type: {
            kind: 'option',
            elem: { kind: 'move_numeric', width: 'u64' },
          },
        },
      ],
      commands: [],
    };

    expectModelErrorCodes(
      () => transactionIRToTsSdkCode(ir),
      ['ir.input.pureValue'],
    );
    expectModelErrorCodes(
      () => transactionIRToGraph(ir),
      ['ir.input.pureValue'],
    );
  });

  it('preserves explicit option None through graph round-trips', () => {
    const ir: TransactionIR = {
      version: 'transaction_ir_1',
      diagnostics: [],
      inputs: [
        {
          id: 'maybeAmount',
          kind: 'Pure',
          value: NULL_VALUE,
          type: {
            kind: 'option',
            elem: { kind: 'move_numeric', width: 'u64' },
          },
        },
      ],
      commands: [],
    };

    const graph = transactionIRToGraph(ir);
    const jsonRoundTrippedGraph = JSON.parse(JSON.stringify(graph)) as PTBGraph;
    const roundTripped = graphToTransactionIR(jsonRoundTrippedGraph);
    const input = roundTripped.inputs[0];

    expect(roundTripped.diagnostics).toEqual([]);
    expect(input).toMatchObject({
      id: 'maybeAmount',
      kind: 'Pure',
      type: {
        kind: 'option',
        elem: { kind: 'move_numeric', width: 'u64' },
      },
    });
    expect(Object.prototype.hasOwnProperty.call(input, 'value')).toBe(true);
    expect((input as Extract<IRInput, { kind: 'Pure' }>).value).toBeNull();
  });

  it('rejects option graph variables that omit canonical null None', () => {
    const graph: PTBGraph = {
      nodes: [
        {
          id: 'maybeAmount',
          kind: 'Variable',
          label: 'maybeAmount',
          name: 'maybeAmount',
          varType: {
            kind: 'option',
            elem: { kind: 'move_numeric', width: 'u64' },
          },
          ports: [
            {
              id: 'out',
              direction: 'out',
              role: 'io',
              dataType: {
                kind: 'option',
                elem: { kind: 'move_numeric', width: 'u64' },
              },
            },
          ],
        },
      ],
      edges: [],
    };

    expect(validatePTBGraph(graph)).toContainEqual(
      expect.objectContaining({
        code: 'graph.variable.optionValue',
        path: '$.nodes[0].value',
      }),
    );
    expect(graphToTransactionIR(graph).diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'graph.variable.optionValue',
        path: '$.nodes[0].value',
      }),
    );
  });

  it('rejects typed pure values that do not match SDK pure value shapes', () => {
    const ir: TransactionIR = {
      version: 'transaction_ir_1',
      diagnostics: [],
      inputs: [
        {
          id: 'amount',
          kind: 'Pure',
          value: '01',
          type: { kind: 'move_numeric', width: 'u8' },
        },
      ],
      commands: [],
    };

    expectModelErrorCodes(
      () => transactionIRToTsSdkCode(ir),
      ['ir.input.pureValue'],
    );
  });

  it('validates typed pure value compatibility at the IR boundary', () => {
    const diagnostics = validateTransactionIR({
      version: 'transaction_ir_1',
      diagnostics: [],
      inputs: [
        {
          id: 'badU8Type',
          kind: 'Pure',
          value: '02',
          type: { kind: 'move_numeric', width: 'u8' },
        },
        {
          id: 'badU8Range',
          kind: 'Pure',
          value: 999,
          type: { kind: 'move_numeric', width: 'u8' },
        },
        {
          id: 'badOption',
          kind: 'Pure',
          value: NULL_VALUE,
          type: { kind: 'option', elem: { kind: 'object' } },
        },
        {
          id: 'badTuple',
          kind: 'Pure',
          value: [],
          type: { kind: 'tuple', elems: [] },
        },
      ],
      commands: [],
    });

    expect(diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'ir.input.pureValue',
        message:
          'Pure input badU8Type requires a canonical unsigned integer string, bigint, or safe integer number for u8.',
        path: '$.inputs[0].value',
      }),
    );
    expect(diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'ir.input.pureValue',
        message:
          'Pure input badU8Range requires a u8 value within the supported unsigned integer range.',
        path: '$.inputs[1].value',
      }),
    );
    expect(diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'ir.input.pureValue',
        message:
          'Pure input badOption cannot use object as a pure value type. Use an Object input instead.',
        path: '$.inputs[2].type.elem',
      }),
    );
    expect(diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'ir.input.pureValue',
        message: 'Pure input badTuple cannot use tuple as a pure value type.',
        path: '$.inputs[3].type',
      }),
    );
  });

  it('rejects typed pure address and id values that are not Sui addresses', () => {
    const cases: Array<'address' | 'id'> = ['address', 'id'];

    cases.forEach((name) => {
      const ir: TransactionIR = {
        version: 'transaction_ir_1',
        diagnostics: [],
        inputs: [
          {
            id: name,
            kind: 'Pure',
            value: 'not-an-address',
            type: { kind: 'scalar', name },
          },
        ],
        commands: [],
      };

      expectModelErrorCodes(
        () => transactionIRToTsSdkCode(ir),
        ['ir.input.pureValue'],
      );
    });
  });

  it('renders typed pure address values accepted by the SDK Address BCS schema', () => {
    const ir: TransactionIR = {
      version: 'transaction_ir_1',
      diagnostics: [],
      inputs: [
        {
          id: 'recipient',
          kind: 'Pure',
          value: '0x2',
          type: { kind: 'scalar', name: 'address' },
        },
      ],
      commands: [],
    };

    const code = transactionIRToTsSdkCode(ir);

    expect(parseObjectId('0x2')).toBe(normalizedObjectId('2'));
    expect(code).toContain(`tx.pure("address", "${normalizedObjectId('2')}")`);
    expectValidTypeScriptSource(code);
  });

  it('rejects empty address and JSON-U64 parser inputs instead of silently normalizing them', () => {
    expect(parseObjectId('')).toBeUndefined();
    expect(parseObjectId('0x')).toBeUndefined();
    expect(parseObjectId('abc')).toBeUndefined();
    expect(parseObjectId('0x0')).toBe(normalizedObjectId('0'));
    expect(parseObjectId('0x2')).toBe(normalizedObjectId('2'));
    expect(parseJsonU64('')).toBeUndefined();
    expect(parseJsonU64('0x10')).toBeUndefined();
    expect(parseJsonU64(' 100 ')).toBeUndefined();
    expect(parseJsonU64('007')).toBeUndefined();
    expect(parseJsonU64('+1')).toBeUndefined();
    expect(parseJsonU64('0')).toBe('0');
    expect(parseJsonU64(7)).toBe('7');
  });

  it('renders bigint typed pure values and serializes them through the JSON helper', () => {
    const ir: TransactionIR = {
      version: 'transaction_ir_1',
      diagnostics: [],
      inputs: [
        {
          id: 'amount',
          kind: 'Pure',
          value: 100n,
          type: { kind: 'move_numeric', width: 'u64' },
        },
      ],
      commands: [],
    };

    const code = transactionIRToTsSdkCode(ir);
    const graph = transactionIRToGraph(ir);

    expect(code).toContain('tx.pure("u64", "100")');
    expect(() => JSON.stringify(graph)).toThrow(/BigInt/);
    expect(jsonStringifyWithBigInt(graph)).toContain('"value":"100"');
    expectValidTypeScriptSource(code);
  });

  it('renders u8, u16, and u32 typed pure values as SDK-compatible numbers', () => {
    const ir: TransactionIR = {
      version: 'transaction_ir_1',
      diagnostics: [],
      inputs: [
        {
          id: 'small',
          kind: 'Pure',
          value: '100',
          type: { kind: 'move_numeric', width: 'u8' },
        },
        {
          id: 'list',
          kind: 'Pure',
          value: ['1', '2'],
          type: {
            kind: 'vector',
            elem: { kind: 'move_numeric', width: 'u16' },
          },
        },
        {
          id: 'maybe',
          kind: 'Pure',
          value: '3',
          type: {
            kind: 'option',
            elem: { kind: 'move_numeric', width: 'u32' },
          },
        },
      ],
      commands: [],
    };

    const code = transactionIRToTsSdkCode(ir);

    expect(code).toContain('tx.pure("u8", 100)');
    expect(code).toContain('tx.pure("vector<u16>", [1,2])');
    expect(code).toContain('tx.pure.option("u32", 3)');
    expectValidTypeScriptSource(code);
  });

  it('normalizes typed pure address and id values inside vector and option containers', () => {
    const ir: TransactionIR = {
      version: 'transaction_ir_1',
      diagnostics: [],
      inputs: [
        {
          id: 'addresses',
          kind: 'Pure',
          value: ['0x2'],
          type: {
            kind: 'vector',
            elem: { kind: 'scalar', name: 'address' },
          },
        },
        {
          id: 'ids',
          kind: 'Pure',
          value: ['0x3'],
          type: {
            kind: 'vector',
            elem: { kind: 'scalar', name: 'id' },
          },
        },
        {
          id: 'maybeAddress',
          kind: 'Pure',
          value: '0x4',
          type: {
            kind: 'option',
            elem: { kind: 'scalar', name: 'address' },
          },
        },
        {
          id: 'maybeId',
          kind: 'Pure',
          value: '0x5',
          type: {
            kind: 'option',
            elem: { kind: 'scalar', name: 'id' },
          },
        },
      ],
      commands: [],
    };

    const code = transactionIRToTsSdkCode(ir);

    expect(code).toContain(
      `tx.pure("vector<address>", ["${normalizedObjectId('2')}"])`,
    );
    expect(code).toContain(
      `tx.pure("vector<id>", ["${normalizedObjectId('3')}"])`,
    );
    expect(code).toContain(
      `tx.pure.option("address", "${normalizedObjectId('4')}")`,
    );
    expect(code).toContain(
      `tx.pure.option("id", "${normalizedObjectId('5')}")`,
    );
    expectValidTypeScriptSource(code);
  });

  it('rejects empty typed pure address and id values before code generation', () => {
    const cases: Array<{
      id: string;
      value: unknown;
      type: PTBType;
      message: string;
      path: string;
    }> = [
      {
        id: 'recipient',
        value: '',
        type: { kind: 'scalar', name: 'address' },
        message: 'Pure input recipient requires a non-empty Sui address.',
        path: '$.inputs[0].value',
      },
      {
        id: 'objectId',
        value: '0x',
        type: { kind: 'scalar', name: 'id' },
        message: 'Pure input objectId requires a non-empty Sui object ID.',
        path: '$.inputs[0].value',
      },
      {
        id: 'addressList',
        value: ['0x1', ''],
        type: {
          kind: 'vector',
          elem: { kind: 'scalar', name: 'address' },
        },
        message: 'Pure input addressList requires a non-empty Sui address.',
        path: '$.inputs[0].value[1]',
      },
    ];

    cases.forEach(({ id, value, type, message, path }) => {
      try {
        transactionIRToTsSdkCode({
          version: 'transaction_ir_1',
          diagnostics: [],
          inputs: [{ id, kind: 'Pure', value, type }],
          commands: [],
        });
      } catch (error) {
        expect(error).toBeInstanceOf(PTBModelError);
        const diagnostics = (error as PTBModelError).diagnostics;
        expect(diagnostics[0]).toEqual(
          expect.objectContaining({
            code: 'ir.input.pureValue',
            message,
            path,
          }),
        );
        return;
      }
      throw new Error('Expected PTBModelError.');
    });
  });

  it('reports empty Move integer strings as invalid typed pure values', () => {
    const ir: TransactionIR = {
      version: 'transaction_ir_1',
      diagnostics: [],
      inputs: [
        {
          id: 'amount',
          kind: 'Pure',
          value: '',
          type: { kind: 'move_numeric', width: 'u64' },
        },
      ],
      commands: [],
    };

    try {
      transactionIRToTsSdkCode(ir);
    } catch (error) {
      expect(error).toBeInstanceOf(PTBModelError);
      const diagnostics = (error as PTBModelError).diagnostics;
      expect(diagnostics[0]).toEqual(
        expect.objectContaining({
          code: 'ir.input.pureValue',
          message:
            'Pure input amount requires a canonical unsigned integer string, bigint, or safe integer number for u64.',
          path: '$.inputs[0].value',
        }),
      );
      return;
    }
    throw new Error('Expected PTBModelError.');
  });

  it('normalizes typed pure address leaves inside nested composite values', () => {
    const ir: TransactionIR = {
      version: 'transaction_ir_1',
      diagnostics: [],
      inputs: [
        {
          id: 'nestedAddress',
          kind: 'Pure',
          value: ['0x6'],
          type: {
            kind: 'option',
            elem: {
              kind: 'vector',
              elem: { kind: 'scalar', name: 'address' },
            },
          },
        },
      ],
      commands: [],
    };

    const code = transactionIRToTsSdkCode(ir);

    expect(code).toContain(
      `tx.pure.option("vector<address>", ["${normalizedObjectId('6')}"])`,
    );
    expectValidTypeScriptSource(code);
  });

  it('rejects pure inputs that mix raw bytes with typed pure display values', () => {
    const ir: TransactionIR = {
      version: 'transaction_ir_1',
      diagnostics: [],
      inputs: [
        {
          id: 'conflictingPure',
          kind: 'Pure',
          bytes: 'AQID',
          value: '0x2',
          type: { kind: 'scalar', name: 'address' },
        },
      ],
      commands: [],
    };

    expectModelErrorCodes(
      () => transactionIRToTsSdkCode(ir),
      ['ir.input.pureRedundant'],
    );
  });

  it('accepts raw pure bytes with a graph type hint for TS SDK rendering', () => {
    const ir: TransactionIR = {
      version: 'transaction_ir_1',
      diagnostics: [],
      inputs: [
        {
          id: 'rawPureWithTypeHint',
          kind: 'Pure',
          bytes: 'AQIDBAUGBwg=',
          type: { kind: 'move_numeric', width: 'u64' },
        },
      ],
      commands: [],
    };

    const code = transactionIRToTsSdkCode(ir);

    expect(code).toContain('tx.pure(fromBase64("AQIDBAUGBwg="))');
    expectValidTypeScriptSource(code);
  });

  it('rejects fixed-width raw pure bytes that conflict with the type hint', () => {
    const ir: TransactionIR = {
      version: 'transaction_ir_1',
      diagnostics: [],
      inputs: [
        {
          id: 'rawPureWithBadTypeHint',
          kind: 'Pure',
          bytes: 'AQID',
          type: { kind: 'move_numeric', width: 'u64' },
        },
      ],
      commands: [],
    };

    expect(validateTransactionIR(ir)).toContainEqual(
      expect.objectContaining({
        code: 'ir.input.pureBytesType',
        path: '$.inputs[0].bytes',
      }),
    );
    expectModelErrorCodes(
      () => transactionIRToTsSdkCode(ir),
      ['ir.input.pureBytesType'],
    );
  });

  it('diagnoses invalid pure type shapes before TS SDK rendering', () => {
    const ir: TransactionIR = {
      version: 'transaction_ir_1',
      diagnostics: [],
      inputs: [
        {
          id: 'badType',
          kind: 'Pure',
          value: [1, 2, 3],
          type: { kind: 'scalar', name: 'futureScalar' },
        },
      ],
      commands: [],
    };

    expectModelErrorCodes(
      () => transactionIRToTsSdkCode(ir),
      ['graph.type.scalar'],
    );
  });

  it('reports malformed FundsWithdrawal values in Mermaid without throwing TypeError', () => {
    const mermaid = transactionIRToMermaid(
      {
        version: 'transaction_ir_1',
        diagnostics: [],
        inputs: [
          {
            id: 'funds',
            kind: 'FundsWithdrawal',
            value: {},
          } as never,
        ],
        commands: [],
      },
      { showArgumentValues: true },
    );

    expect(mermaid).toContain('ir.input.fundsWithdrawal');
    expect(mermaid).toContain('invalid funds withdrawal');
  });

  it('rejects invalid object input shapes before TS SDK code generation', () => {
    const ir: TransactionIR = {
      version: 'transaction_ir_1',
      diagnostics: [],
      inputs: [
        {
          id: 'object',
          kind: 'Object',
          object: { kind: 'FutureObject', objectId: '0x1' },
        },
      ],
      commands: [],
    };

    expectModelErrorCodes(
      () => transactionIRToTsSdkCode(ir),
      ['ir.input.object'],
    );
  });
});

describe('graph conversion', () => {
  it('diagnoses incomplete graph inputs', () => {
    const graph: PTBGraph = {
      nodes: [
        {
          id: 'cmd-1',
          kind: 'Command',
          command: 'splitCoins',
          ports: [],
        },
      ],
      edges: [],
    };

    const ir = graphToTransactionIR(graph);

    expect(
      ir.diagnostics.some(
        (diagnostic) => diagnostic.code === 'graph.arg.missing',
      ),
    ).toBe(true);
  });

  it('keeps unresolved object inputs as objects through graph round-trip', () => {
    const ir: TransactionIR = {
      version: 'transaction_ir_1',
      inputs: [{ id: 'object_0', kind: 'Object' }],
      commands: [],
      diagnostics: [],
    };

    const graph = transactionIRToGraph(ir);
    const variable = graph.nodes.find((node) => node.id === 'var-0') as
      | VariableNode
      | undefined;
    const roundTripped = graphToTransactionIR(graph);
    const roundTrippedInput = roundTripped.inputs[0];
    if (!roundTrippedInput) throw new Error('Expected round-tripped input');

    expect(variable?.varType).toEqual({ kind: 'object' });
    expect(roundTrippedInput).toMatchObject({
      id: 'object_0',
      kind: 'Object',
    });
    expect('object' in roundTrippedInput).toBe(false);
    expect(roundTripped.diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'graph.input.object.unresolved',
        path: '$.nodes[2]',
      }),
    );
  });

  it('omits graph variables that are not referenced by command inputs from executable IR', () => {
    const graph = transactionIRToGraph({
      version: 'transaction_ir_1',
      inputs: [
        {
          id: 'recipient',
          kind: 'Pure',
          value: normalizedObjectId('1'),
          type: { kind: 'scalar', name: 'address' },
        },
      ],
      diagnostics: [],
      commands: [
        {
          id: 'call',
          kind: 'MoveCall',
          package: normalizedObjectId('2'),
          module: 'sui',
          function: 'transfer',
          typeArguments: [],
          arguments: [{ kind: 'Input', index: 0 }],
          resultCount: 0,
        },
      ],
    });
    graph.nodes.push({
      id: 'orphan',
      kind: 'Variable',
      name: 'orphan',
      varType: { kind: 'scalar', name: 'string' },
      value: 'not used',
      ports: [{ id: 'out', direction: 'out', role: 'io' }],
      position: { x: 999, y: 999 },
    });

    const ir = graphToTransactionIR(graph);

    expect(ir.diagnostics).toEqual([]);
    expect(ir.inputs).toHaveLength(1);
    expect(ir.inputs.map((input) => input.id)).toEqual(['recipient']);
  });

  it('validates graph rawInput shape before accepting a graph document', () => {
    const diagnostics = validatePTBGraph({
      nodes: [
        {
          id: 'var-0',
          kind: 'Variable',
          varType: { kind: 'object' },
          name: 'badObject',
          rawInput: {
            kind: 'Object',
            object: {
              kind: 'ImmOrOwnedObject',
              objectId: '0xnot-hex',
              version: '1',
              digest: TEST_DIGEST_1,
            },
          },
          ports: [{ id: 'out', direction: 'out', role: 'io' }],
        },
      ],
      edges: [],
    });

    expect(diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'graph.rawInput.object',
        path: '$.nodes[0].rawInput.object',
      }),
    );
  });

  it('rejects graph rawInput unknown fields and value conflicts', () => {
    const ownedObject = {
      kind: 'ImmOrOwnedObject' as const,
      objectId: normalizedObjectId('7'),
      version: '7',
      digest: TEST_DIGEST_1,
    };
    const diagnostics = validatePTBGraph({
      nodes: [
        {
          id: 'pure-raw',
          kind: 'Variable',
          varType: { kind: 'scalar', name: 'string' },
          name: 'pureRaw',
          value: 'display',
          rawInput: { kind: 'Pure', bytes: 'AQID' },
          ports: [{ id: 'out', direction: 'out', role: 'io' }],
        },
        {
          id: 'object-raw',
          kind: 'Variable',
          varType: { kind: 'object' },
          name: 'objectRaw',
          value: { ...ownedObject, version: '8' },
          rawInput: {
            kind: 'Object',
            object: ownedObject,
          },
          ports: [{ id: 'out', direction: 'out', role: 'io' }],
        },
        {
          id: 'object-raw-unknown',
          kind: 'Variable',
          varType: { kind: 'object' },
          name: 'objectRawUnknown',
          rawInput: {
            kind: 'Object',
            object: ownedObject,
            extraRawInputField: true,
          } as never,
          ports: [{ id: 'out', direction: 'out', role: 'io' }],
        },
      ],
      edges: [],
    });

    expect(diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'graph.variable.rawInputValue',
        path: '$.nodes[0].value',
      }),
    );
    expect(diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'graph.rawInput.unknownField',
        path: '$.nodes[2].rawInput.extraRawInputField',
      }),
    );
    expect(diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'graph.variable.rawInputValue',
        path: '$.nodes[1].value',
      }),
    );
  });

  it('validates public graph optional fields and command params', () => {
    const diagnostics = validatePTBGraph({
      extraGraphField: true,
      nodes: [
        {
          id: 'var-0',
          kind: 'Variable',
          extraNodeField: true,
          label: 1,
          position: {
            x: Number.POSITIVE_INFINITY,
            y: 0,
            extraPositionField: true,
          },
          varType: { kind: 'object', typeTag: 7, extraTypeField: true },
          name: 'input',
          semantic: { kind: 'GasCoin', extraSemanticField: true },
          ports: [
            {
              id: 'out',
              direction: 'out',
              role: 'io',
              extraPortField: true,
              label: 3,
              typeStr: 4,
              dataType: { kind: 'unknown', debugInfo: 5 },
            },
          ],
        },
        {
          id: 'cmd-0',
          kind: 'Command',
          command: 'moveCall',
          params: {
            runtime: 'bad',
            ui: {
              amountsCount: -1,
              pkgId: normalizedObjectId('2'),
              unexpected: true,
            } as never,
            moveCall: { target: `${normalizedObjectId('2')}::m::f` } as never,
          },
          ports: [{ id: 'in_arg_0', direction: 'in', role: 'io' }],
        },
      ],
      edges: [
        {
          id: 'edge-0',
          kind: 'io',
          source: 'var-0',
          sourceHandle: 'out',
          target: 'cmd-0',
          targetHandle: 'in_arg_0',
          extraEdgeField: true,
          cast: { to: 'u512', extraCastField: true },
        },
      ],
    });
    const codes = diagnostics.map((diagnostic) => diagnostic.code);

    expect(codes).toContain('graph.unknownField');
    expect(codes).toContain('graph.node.unknownField');
    expect(codes).toContain('graph.node.label');
    expect(codes).toContain('graph.node.position');
    expect(codes).toContain('graph.node.position.unknownField');
    expect(codes).toContain('graph.type.object');
    expect(codes).toContain('graph.type.unknownField');
    expect(codes).toContain('graph.type.unknown');
    expect(codes).toContain('graph.variable.semantic.unknownField');
    expect(codes).toContain('graph.port.unknownField');
    expect(codes).toContain('graph.port.field');
    expect(codes).toContain('graph.command.params.runtime');
    expect(codes).toContain('graph.command.params.ui.count');
    expect(codes).toContain('graph.command.params.ui.unknownField');
    expect(codes).toContain('graph.command.params.unknownField');
    expect(codes).toContain('graph.edge.unknownField');
    expect(codes).toContain('graph.edge.cast.unknownField');
    expect(codes).toContain('graph.edge.cast');
  });

  it('rejects unsafe integer graph UI counts', () => {
    const diagnostics = validatePTBGraph({
      nodes: [
        {
          id: 'cmd-0',
          kind: 'Command',
          command: 'splitCoins',
          params: {
            ui: {
              amountsCount: Number.MAX_SAFE_INTEGER + 1,
            },
          },
          ports: [],
        },
      ],
      edges: [],
    });

    expect(diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'graph.command.params.ui.count',
        path: '$.nodes[0].params.ui.amountsCount',
      }),
    );
  });

  it('rejects graph port ids outside the canonical model handle form', () => {
    const graph: PTBGraph = {
      nodes: [
        {
          id: 'source',
          kind: 'Variable',
          name: 'source',
          varType: { kind: 'scalar', name: 'address' },
          value: normalizedObjectId('1'),
          ports: [
            { id: 'out:address', direction: 'out', role: 'io' },
            { id: 'out-string', direction: 'out', role: 'io' },
            { id: '0out', direction: 'out', role: 'io' },
          ],
        },
        {
          id: 'cmd-0',
          kind: 'Command',
          command: 'transferObjects',
          ports: [
            { id: 'in_recipient', direction: 'in', role: 'io' },
            { id: 'in_object_0', direction: 'in', role: 'io' },
          ],
        },
      ],
      edges: [
        {
          id: 'edge-0',
          kind: 'io',
          source: 'source',
          sourceHandle: 'out:address',
          target: 'cmd-0',
          targetHandle: 'in_recipient',
        },
        {
          id: 'edge-1',
          kind: 'io',
          source: 'source',
          sourceHandle: 'out-string',
          target: 'cmd-0',
          targetHandle: 'in_object_0',
        },
      ],
    };

    const diagnostics = validatePTBGraph(graph);

    expect(diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'graph.port.id',
        path: '$.nodes[0].ports[0].id',
      }),
    );
    expect(diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'graph.port.id',
        path: '$.nodes[0].ports[1].id',
      }),
    );
    expect(diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'graph.port.id',
        path: '$.nodes[0].ports[2].id',
      }),
    );
    expect(graphToTransactionIR(graph).inputs).toHaveLength(0);
  });

  it('uses graph runtime params as the only MoveCall transaction source', () => {
    const graph: PTBGraph = {
      nodes: [
        {
          id: 'cmd-0',
          kind: 'Command',
          command: 'moveCall',
          params: {
            runtime: {
              target: `${normalizedObjectId('2')}::module::call`,
              typeArguments: ['0x2::coin::Coin'],
            },
          },
          ports: [],
        },
      ],
      edges: [],
    };

    const ir = graphToTransactionIR(graph);

    expect(ir.diagnostics).toEqual([]);
    expect(ir.commands[0]).toMatchObject({
      kind: 'MoveCall',
      package: normalizedObjectId('2'),
      module: 'module',
      function: 'call',
      typeArguments: [TEST_COIN_TYPE],
    });
  });

  it('rejects builder-shaped MoveCall and UI transaction params in the model graph', () => {
    const graph: PTBGraph = {
      nodes: [
        {
          id: 'cmd-0',
          kind: 'Command',
          command: 'moveCall',
          params: {
            ui: {
              pkgId: normalizedObjectId('2'),
              module: 'module',
              func: 'call',
            } as never,
            moveCall: {
              target: `${normalizedObjectId('2')}::module::call`,
              typeArgs: ['0x2::coin::Coin'],
            } as never,
          },
          ports: [],
        },
      ],
      edges: [],
    };

    const ir = graphToTransactionIR(graph);
    const codes = ir.diagnostics.map((diagnostic) => diagnostic.code);

    expect(ir.commands).toEqual([]);
    expect(codes).toContain('graph.command.params.ui.unknownField');
    expect(codes).toContain('graph.command.params.unknownField');
  });

  it('rejects malformed runtime MoveCall type arguments instead of dropping them', () => {
    const graph: PTBGraph = {
      nodes: [
        {
          id: 'cmd-0',
          kind: 'Command',
          command: 'moveCall',
          params: {
            runtime: {
              target: `${normalizedObjectId('2')}::module::call`,
              typeArguments: ['0x2::coin::Coin', 1],
            },
          },
          ports: [],
        },
      ],
      edges: [],
    };

    const ir = graphToTransactionIR(graph);

    expect(ir.commands[0]).toMatchObject({
      kind: 'Unsupported',
      sourceKind: 'InvalidMoveCallTypeArguments',
    });
    expect(ir.diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'graph.command.params.runtime.typeArguments',
        path: '$.nodes[0].params.runtime.typeArguments',
      }),
    );
  });

  it('rejects non-string Publish and Upgrade runtime module arrays', () => {
    const graph: PTBGraph = {
      nodes: [
        {
          id: 'publish',
          kind: 'Command',
          command: 'publish',
          params: {
            runtime: {
              modules: ['AQID', 7] as never,
              dependencies: [normalizedObjectId('2')],
            },
          },
          ports: [],
        },
        {
          id: 'upgrade',
          kind: 'Command',
          command: 'upgrade',
          params: {
            runtime: {
              modules: ['AQID'],
              dependencies: [normalizedObjectId('2'), 7] as never,
              package: normalizedObjectId('3'),
            },
          },
          ports: [],
        },
      ],
      edges: [],
    };

    const codes = graphToTransactionIR(graph).diagnostics.map(
      (diagnostic) => diagnostic.code,
    );

    expect(codes).toContain('graph.command.params.runtime.modules');
    expect(codes).toContain('graph.command.params.runtime.dependencies');
  });

  it('rejects runtime command params outside the command-specific schema', () => {
    const graph: PTBGraph = {
      nodes: [
        {
          id: 'cmd-0',
          kind: 'Command',
          command: 'moveCall',
          params: {
            runtime: {
              target: `${normalizedObjectId('2')}::module::call`,
              unexpectedRuntimeKey: true,
            },
          },
          ports: [],
        },
      ],
      edges: [],
    };

    const ir = graphToTransactionIR(graph);

    expect(ir.commands).toEqual([]);
    expect(ir.diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'graph.command.params.runtime.unknownField',
        path: '$.nodes[0].params.runtime.unexpectedRuntimeKey',
      }),
    );
  });

  it('requires explicit sourceKind for unsupported graph commands', () => {
    const graph: PTBGraph = {
      nodes: [
        {
          id: 'cmd-0',
          kind: 'Command',
          command: 'unsupported',
          ports: [],
        },
      ],
      edges: [],
    };

    const ir = graphToTransactionIR(graph);

    expect(ir.commands).toEqual([]);
    expect(ir.diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'graph.command.params.runtime.sourceKind',
        path: '$.nodes[0].params.runtime.sourceKind',
      }),
    );
  });

  it('does not read MakeMoveVec type information from UI params', () => {
    const graph: PTBGraph = {
      nodes: [
        {
          id: 'cmd-0',
          kind: 'Command',
          command: 'makeMoveVec',
          params: {
            ui: {
              elemTypeTag: TEST_COIN_SUI_TYPE,
            } as never,
          },
          ports: [],
        },
      ],
      edges: [],
    };

    const ir = graphToTransactionIR(graph);
    const codes = ir.diagnostics.map((diagnostic) => diagnostic.code);

    expect(ir.commands).toEqual([]);
    expect(codes).toContain('graph.command.params.ui.unknownField');
  });

  it('rejects malformed runtime MakeMoveVec type values instead of treating them as null', () => {
    const graph: PTBGraph = {
      nodes: [
        {
          id: 'cmd-0',
          kind: 'Command',
          command: 'makeMoveVec',
          params: {
            runtime: {
              type: 7,
            },
          },
          ports: [],
        },
      ],
      edges: [],
    };

    const ir = graphToTransactionIR(graph);

    expect(ir.commands[0]).toMatchObject({
      kind: 'Unsupported',
      sourceKind: 'InvalidMakeMoveVecType',
    });
    expect(ir.diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'graph.command.params.runtime.type',
        path: '$.nodes[0].params.runtime.type',
      }),
    );
  });

  it('preserves explicit MakeMoveVec null type through IR and graph conversion', () => {
    const ir: TransactionIR = {
      version: 'transaction_ir_1',
      diagnostics: [],
      inputs: [{ id: 'elem', kind: 'Pure', bytes: 'AA==' }],
      commands: [
        {
          id: 'cmd-0',
          kind: 'MakeMoveVec',
          type: NULL_VALUE,
          elements: [{ kind: 'Input', index: 0 }],
          resultCount: 1,
        },
      ],
    };

    const graph = transactionIRToGraph(ir);
    const command = graph.nodes.find(
      (node): node is CommandNode => node.kind === 'Command',
    );
    const roundTripped = graphToTransactionIR(graph);

    expect(command?.params).toEqual({ runtime: { type: NULL_VALUE } });
    expect(roundTripped.commands[0]).toMatchObject({
      kind: 'MakeMoveVec',
      type: NULL_VALUE,
    });
  });

  it('rejects declared graph flow paths that leave commands disconnected', () => {
    const graph: PTBGraph = {
      nodes: [
        {
          id: 'start',
          kind: 'Start',
          ports: [{ id: 'out', direction: 'out', role: 'flow' }],
        },
        {
          id: 'cmd-0',
          kind: 'Command',
          command: 'unsupported',
          ports: [
            { id: 'in', direction: 'in', role: 'flow' },
            { id: 'out', direction: 'out', role: 'flow' },
          ],
        },
        {
          id: 'cmd-1',
          kind: 'Command',
          command: 'unsupported',
          ports: [
            { id: 'in', direction: 'in', role: 'flow' },
            { id: 'out', direction: 'out', role: 'flow' },
          ],
        },
        {
          id: 'end',
          kind: 'End',
          ports: [{ id: 'in', direction: 'in', role: 'flow' }],
        },
      ],
      edges: [
        {
          id: 'flow-start-cmd0',
          kind: 'flow',
          source: 'start',
          sourceHandle: 'out',
          target: 'cmd-0',
          targetHandle: 'in',
        },
        {
          id: 'flow-cmd0-end',
          kind: 'flow',
          source: 'cmd-0',
          sourceHandle: 'out',
          target: 'end',
          targetHandle: 'in',
        },
      ],
    };

    expect(graphToTransactionIR(graph).diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'graph.flow.disconnected',
        path: '$.nodes[2]',
      }),
    );
  });

  it('reports declared graph flow topology failures explicitly', () => {
    const codes = (graph: PTBGraph) =>
      validatePTBGraph(graph).map((diagnostic) => diagnostic.code);

    expect(
      codes({
        nodes: [
          {
            id: 'end',
            kind: 'End',
            ports: [{ id: 'in', direction: 'in', role: 'flow' }],
          },
        ],
        edges: [],
      }),
    ).toContain('graph.flow.start');

    expect(
      codes({
        nodes: [
          {
            id: 'start',
            kind: 'Start',
            ports: [{ id: 'out', direction: 'out', role: 'flow' }],
          },
        ],
        edges: [],
      }),
    ).toContain('graph.flow.end');

    expect(
      codes({
        nodes: [
          {
            id: 'start',
            kind: 'Start',
            ports: [{ id: 'out', direction: 'out', role: 'flow' }],
          },
          {
            id: 'end',
            kind: 'End',
            ports: [{ id: 'in', direction: 'in', role: 'flow' }],
          },
        ],
        edges: [],
      }),
    ).toContain('graph.flow.path');

    expect(
      codes({
        nodes: [
          {
            id: 'start',
            kind: 'Start',
            ports: [{ id: 'out', direction: 'out', role: 'flow' }],
          },
          {
            id: 'cmd-0',
            kind: 'Command',
            command: 'unsupported',
            ports: [
              { id: 'in', direction: 'in', role: 'flow' },
              { id: 'out', direction: 'out', role: 'flow' },
            ],
          },
          {
            id: 'cmd-1',
            kind: 'Command',
            command: 'unsupported',
            ports: [
              { id: 'in', direction: 'in', role: 'flow' },
              { id: 'out', direction: 'out', role: 'flow' },
            ],
          },
          {
            id: 'end',
            kind: 'End',
            ports: [{ id: 'in', direction: 'in', role: 'flow' }],
          },
        ],
        edges: [
          {
            id: 'flow-start-cmd0',
            kind: 'flow',
            source: 'start',
            sourceHandle: 'out',
            target: 'cmd-0',
            targetHandle: 'in',
          },
          {
            id: 'flow-cmd0-cmd1',
            kind: 'flow',
            source: 'cmd-0',
            sourceHandle: 'out',
            target: 'cmd-1',
            targetHandle: 'in',
          },
          {
            id: 'flow-cmd1-cmd0',
            kind: 'flow',
            source: 'cmd-1',
            sourceHandle: 'out',
            target: 'cmd-0',
            targetHandle: 'in',
          },
        ],
      }),
    ).toContain('graph.flow.cycle');
  });

  it('rejects multiple flow edges from or into one graph node', () => {
    const graph: PTBGraph = {
      nodes: [
        {
          id: 'start',
          kind: 'Start',
          ports: [
            { id: 'out_a', direction: 'out', role: 'flow' },
            { id: 'out_b', direction: 'out', role: 'flow' },
          ],
        },
        {
          id: 'cmd-0',
          kind: 'Command',
          command: 'unsupported',
          ports: [
            { id: 'in', direction: 'in', role: 'flow' },
            { id: 'out', direction: 'out', role: 'flow' },
          ],
        },
        {
          id: 'cmd-1',
          kind: 'Command',
          command: 'unsupported',
          ports: [
            { id: 'in', direction: 'in', role: 'flow' },
            { id: 'out', direction: 'out', role: 'flow' },
          ],
        },
        {
          id: 'end',
          kind: 'End',
          ports: [
            { id: 'in_a', direction: 'in', role: 'flow' },
            { id: 'in_b', direction: 'in', role: 'flow' },
          ],
        },
      ],
      edges: [
        {
          id: 'flow-start-cmd0',
          kind: 'flow',
          source: 'start',
          sourceHandle: 'out_a',
          target: 'cmd-0',
          targetHandle: 'in',
        },
        {
          id: 'flow-start-cmd1',
          kind: 'flow',
          source: 'start',
          sourceHandle: 'out_b',
          target: 'cmd-1',
          targetHandle: 'in',
        },
        {
          id: 'flow-cmd0-end',
          kind: 'flow',
          source: 'cmd-0',
          sourceHandle: 'out',
          target: 'end',
          targetHandle: 'in_a',
        },
        {
          id: 'flow-cmd1-end',
          kind: 'flow',
          source: 'cmd-1',
          sourceHandle: 'out',
          target: 'end',
          targetHandle: 'in_b',
        },
      ],
    };

    const codes = validatePTBGraph(graph).map((diagnostic) => diagnostic.code);

    expect(codes).toContain('graph.edge.duplicateFlowSource');
    expect(codes).toContain('graph.edge.duplicateFlowTarget');
  });

  it('preserves graph rawInput diagnostics when structural graph errors block conversion', () => {
    const graph: PTBGraph = {
      nodes: [
        {
          id: 'start',
          kind: 'Start',
          ports: [{ id: 'out', direction: 'out', role: 'flow' }],
        },
        {
          id: 'cmd-0',
          kind: 'Command',
          command: 'unsupported',
          ports: [
            { id: 'in', direction: 'in', role: 'flow' },
            { id: 'out', direction: 'out', role: 'flow' },
          ],
        },
        {
          id: 'cmd-1',
          kind: 'Command',
          command: 'unsupported',
          ports: [
            { id: 'in', direction: 'in', role: 'flow' },
            { id: 'out', direction: 'out', role: 'flow' },
          ],
        },
        {
          id: 'var-0',
          kind: 'Variable',
          varType: { kind: 'object' },
          name: 'badObject',
          rawInput: {
            kind: 'Object',
            object: {
              kind: 'ImmOrOwnedObject',
              objectId: '0xnot-hex',
              version: '1',
              digest: TEST_DIGEST_1,
            },
          },
          ports: [{ id: 'out', direction: 'out', role: 'io' }],
        },
        {
          id: 'end',
          kind: 'End',
          ports: [{ id: 'in', direction: 'in', role: 'flow' }],
        },
      ],
      edges: [
        {
          id: 'flow-start-cmd0',
          kind: 'flow',
          source: 'start',
          sourceHandle: 'out',
          target: 'cmd-0',
          targetHandle: 'in',
        },
        {
          id: 'flow-cmd0-end',
          kind: 'flow',
          source: 'cmd-0',
          sourceHandle: 'out',
          target: 'end',
          targetHandle: 'in',
        },
      ],
    };

    const ir = graphToTransactionIR(graph);

    expect(ir.inputs).toEqual([]);
    expect(ir.commands).toEqual([]);
    expect(ir.diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'graph.flow.disconnected',
        path: '$.nodes[2]',
      }),
    );
    expect(ir.diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'graph.rawInput.object',
        path: '$.nodes[3].rawInput.object',
      }),
    );
  });

  it('does not silently fallback when graph rawInput is malformed', () => {
    const graph = {
      nodes: [
        {
          id: 'var-0',
          kind: 'Variable',
          varType: { kind: 'object' },
          name: 'badReceiving',
          value: {
            objectId: '0xvalidFallback',
            version: '1',
            digest: TEST_DIGEST_2,
          },
          rawInput: {
            kind: 'Object',
            object: {
              kind: 'Receiving',
              objectId: '0xreceiving',
              version: '2',
            },
          },
          ports: [{ id: 'out', direction: 'out', role: 'io' }],
        },
      ],
      edges: [],
    } as unknown as PTBGraph;

    const ir = graphToTransactionIR(graph);

    expect(ir.inputs[0]).toMatchObject({
      kind: 'Unsupported',
      sourceKind: 'InvalidRawInput',
    });
    expect(ir.diagnostics.map((diagnostic) => diagnostic.code)).toContain(
      'graph.rawInput.object',
    );
  });

  it('diagnoses invalid graph rawInput object ids and module bytes', () => {
    const graph: PTBGraph = {
      nodes: [
        {
          id: 'var-0',
          kind: 'Variable',
          varType: { kind: 'object' },
          name: 'badObject',
          rawInput: {
            kind: 'Object',
            object: {
              kind: 'ImmOrOwnedObject',
              objectId: '0xobject',
              version: '0x10',
              digest: TEST_DIGEST_1,
            },
          },
          ports: [{ id: 'out', direction: 'out', role: 'io' }],
        },
        {
          id: 'var-1',
          kind: 'Variable',
          varType: { kind: 'scalar', name: 'string' },
          name: 'badPure',
          rawInput: { kind: 'Pure', bytes: 'A' },
          ports: [{ id: 'out', direction: 'out', role: 'io' }],
        },
        {
          id: 'cmd-0',
          kind: 'Command',
          command: 'publish',
          params: {
            runtime: {
              modules: ['AQID  ', '@@@'],
              dependencies: ['0x2'],
            },
          },
          ports: [],
        },
      ],
      edges: [],
    };

    const ir = graphToTransactionIR(graph);

    expect(ir.inputs.map((input) => input.kind)).toEqual([
      'Unsupported',
      'Unsupported',
    ]);
    expect(ir.commands[0]).toMatchObject({
      kind: 'Unsupported',
      sourceKind: 'InvalidPublishParams',
    });
    expect(ir.diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'graph.rawInput.object',
        path: '$.nodes[0].rawInput.object',
      }),
    );
    expect(ir.diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'graph.rawInput.pure',
        path: '$.nodes[1].rawInput.bytes',
      }),
    );
    expect(ir.diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'graph.command.base64BytesParam',
        path: '$.nodes[2].params.runtime.modules[0]',
      }),
    );
    expect(ir.diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'graph.command.base64BytesParam',
        path: '$.nodes[2].params.runtime.modules[1]',
      }),
    );
    expect(ir.diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'graph.command.objectIdParam',
        path: '$.nodes[2].params.runtime.dependencies[0]',
      }),
    );
  });

  it('renders graph Pure rawInput bytes even when the graph variable carries a type hint', () => {
    const graph: PTBGraph = {
      nodes: [
        {
          id: 'var-0',
          kind: 'Variable',
          varType: { kind: 'move_numeric', width: 'u64' },
          name: 'rawAmountBytes',
          rawInput: { kind: 'Pure', bytes: 'AQIDBAUGBwg=' },
          ports: [{ id: 'out', direction: 'out', role: 'io' }],
        },
      ],
      edges: [],
    };

    const ir = graphToTransactionIR(graph);
    const code = transactionIRToTsSdkCode(ir);

    expect(ir.diagnostics).toEqual([]);
    expect(ir.inputs[0]).toMatchObject({
      kind: 'Pure',
      bytes: 'AQIDBAUGBwg=',
      type: { kind: 'move_numeric', width: 'u64' },
    });
    expect(code).toContain('tx.pure(fromBase64("AQIDBAUGBwg="))');
    expectValidTypeScriptSource(code);
  });

  it('keeps value-only object variables out of IR unless object values are canonical', () => {
    const graph: PTBGraph = {
      nodes: [
        {
          id: 'valid-object',
          kind: 'Variable',
          varType: { kind: 'object' },
          name: 'validObject',
          value: {
            objectId: normalizedObjectId('7'),
            version: '7',
            digest: TEST_DIGEST_1,
          },
          ports: [{ id: 'out', direction: 'out', role: 'io' }],
        },
        {
          id: 'non-canonical-object',
          kind: 'Variable',
          varType: { kind: 'object' },
          name: 'nonCanonicalObject',
          value: { objectId: '0x7', version: '0x10', digest: TEST_DIGEST_1 },
          ports: [{ id: 'out', direction: 'out', role: 'io' }],
        },
        {
          id: 'invalid-object',
          kind: 'Variable',
          varType: { kind: 'object' },
          name: 'invalidObject',
          value: {
            objectId: '0xinvalid',
            version: '16',
            digest: TEST_DIGEST_1,
          },
          ports: [{ id: 'out', direction: 'out', role: 'io' }],
        },
      ],
      edges: [],
    };

    const ir = graphToTransactionIR(graph);

    expect(ir.inputs[0]).toMatchObject({
      kind: 'Object',
      object: { kind: 'ImmOrOwnedObject', version: '7' },
    });
    expect(ir.inputs[1]).toMatchObject({
      kind: 'Object',
      id: 'nonCanonicalObject',
    });
    expect('object' in ir.inputs[1]).toBe(false);
    expect(ir.inputs[2]).toMatchObject({
      kind: 'Object',
      id: 'invalidObject',
    });
    expect('object' in ir.inputs[2]).toBe(false);
    expect(ir.diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'graph.input.object.unresolved',
        path: '$.nodes[1]',
      }),
    );
    expect(ir.diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'graph.input.object.unresolved',
        path: '$.nodes[2]',
      }),
    );
  });

  it('round-trips semantic IR through graph without React Flow types', () => {
    const source = rawTransactionToIR(sampleRawTransaction());
    const graph = transactionIRToGraph(source);
    const roundTripped = graphToTransactionIR(graph);

    expect(graph.nodes.every((node) => !('data' in node))).toBe(true);
    expect(graphEdgesHaveDeclaredHandles(graph)).toBe(true);
    expect(roundTripped.diagnostics).toEqual([]);
    expect(transactionIRToRaw(roundTripped)).toEqual(sampleRawTransaction());
  });

  it('keeps FundsWithdrawal graph variables out of the object type category', () => {
    const source = rawTransactionToIR(sampleRawTransaction());
    const graph = transactionIRToGraph(source);
    const withdrawal = graph.nodes.find((node) => node.id === 'var-2') as
      | VariableNode
      | undefined;

    expect(withdrawal).toMatchObject({
      kind: 'Variable',
      varType: { kind: 'unknown', debugInfo: 'FundsWithdrawal' },
      rawInput: { kind: 'FundsWithdrawal' },
    });

    const roundTripped = graphToTransactionIR(graph);
    expect(roundTripped.inputs[2]).toMatchObject({
      kind: 'FundsWithdrawal',
    });
  });

  it('returns raw and graph conversion outputs without aliasing the source IR', () => {
    const source = rawTransactionToIR(
      sampleRawTransaction({ fundsWithdrawalFrom: 'Sender' }),
    );
    const raw = transactionIRToRaw(source);
    const graph = transactionIRToGraph(source);

    const rawObject = raw.inputs[1] as Extract<RawCallArg, { kind: 'Object' }>;
    rawObject.object.objectId = '0xmutated';
    const rawSplit = raw.commands[0] as Extract<
      RawCommand,
      { kind: 'SplitCoins' }
    >;
    rawSplit.amounts[0] = { kind: 'GasCoin' };

    const graphObject = graph.nodes.find((node) => node.id === 'var-1') as
      | VariableNode
      | undefined;
    if (
      graphObject?.rawInput?.kind === 'Object' &&
      graphObject.rawInput.object.kind === 'ImmOrOwnedObject'
    ) {
      graphObject.rawInput.object.objectId = '0xgraph-mutated';
    }

    expect(source.inputs[1]).toMatchObject({
      kind: 'Object',
      object: { objectId: normalizedObjectId('5') },
    });
    expect(source.commands[0]).toMatchObject({
      kind: 'SplitCoins',
      amounts: [{ kind: 'Input', index: 0 }],
    });
  });

  it('returns graph-to-IR command arrays without aliasing source graph params', () => {
    const typeArgs = ['0x2::sui::SUI'];
    const dependencies = [normalizedObjectId('1')];
    const graph: PTBGraph = {
      nodes: [
        {
          id: 'move',
          kind: 'Command',
          command: 'moveCall',
          params: {
            runtime: {
              target: `${normalizedObjectId('2')}::coin::value`,
              typeArguments: typeArgs,
            },
          },
          ports: [],
        },
        {
          id: 'publish',
          kind: 'Command',
          command: 'publish',
          params: {
            runtime: {
              modules: ['AQID'],
              dependencies,
            },
          },
          ports: [],
        },
      ],
      edges: [],
    };

    const ir = graphToTransactionIR(graph);
    typeArgs[0] = '0xmutated::T';
    dependencies[0] = '0xmutated';

    expect(ir.diagnostics).toEqual([]);
    expect(ir.commands[0]).toMatchObject({
      kind: 'MoveCall',
      typeArguments: [TEST_SUI_TYPE],
    });
    expect(ir.commands[1]).toMatchObject({
      kind: 'Publish',
      dependencies: [normalizedObjectId('1')],
    });
  });

  it('clones cyclic unsupported payloads without overflowing the stack', () => {
    const payload: Record<string, unknown> = { kind: 'FutureInput' };
    payload.self = payload;
    const ir: TransactionIR = {
      version: 'transaction_ir_1',
      diagnostics: [],
      inputs: [
        {
          id: 'future',
          kind: 'Unsupported',
          sourceKind: 'FutureInput',
          value: payload,
        },
      ],
      commands: [],
    };

    const graph = transactionIRToGraph(ir);
    const variableNode = graph.nodes.find((node) => node.id === 'var-0') as
      | VariableNode
      | undefined;

    expect(variableNode?.value).not.toBe(payload);
    expect((variableNode?.value as { self?: unknown }).self).toBe(
      variableNode?.value,
    );
  });

  it('preserves numeric argument order for graph handles beyond single digits', () => {
    const graph: PTBGraph = {
      nodes: [
        {
          id: 'var-0',
          kind: 'Variable',
          varType: { kind: 'scalar', name: 'number' },
          name: 'input_0',
          value: 0,
          ports: [{ id: 'out', direction: 'out', role: 'io' }],
        },
        {
          id: 'cmd-0',
          kind: 'Command',
          command: 'moveCall',
          params: {
            runtime: {
              target: `${normalizedObjectId('2')}::m::f`,
              typeArguments: [],
            },
          },
          ports: [
            { id: 'in', direction: 'in', role: 'flow' },
            { id: 'out', direction: 'out', role: 'flow' },
            ...Array.from({ length: 11 }, (_value, index) => ({
              id: `in_arg_${index}`,
              direction: 'in' as const,
              role: 'io' as const,
            })),
          ],
        },
      ],
      edges: Array.from({ length: 11 }, (_value, index) => ({
        id: `edge-${index}`,
        kind: 'io' as const,
        source: 'var-0',
        sourceHandle: 'out',
        target: 'cmd-0',
        targetHandle: `in_arg_${index}`,
      })).reverse(),
    };

    const ir = graphToTransactionIR(graph);

    expect(ir.commands[0]).toMatchObject({
      kind: 'MoveCall',
      arguments: Array.from({ length: 11 }, () => ({
        kind: 'Input',
        index: 0,
      })),
    });
  });

  it('does not leak sentinel argument references for invalid graph edge sources', () => {
    const graph: PTBGraph = {
      nodes: [
        {
          id: 'cmd-0',
          kind: 'Command',
          command: 'moveCall',
          params: {
            runtime: {
              target: `${normalizedObjectId('2')}::m::f`,
              typeArguments: [],
            },
          },
          ports: [
            { id: 'in', direction: 'in', role: 'flow' },
            { id: 'out', direction: 'out', role: 'flow' },
            { id: 'in_arg_0', direction: 'in', role: 'io' },
          ],
        },
      ],
      edges: [
        {
          id: 'bad-edge',
          kind: 'io',
          source: 'missing-source',
          sourceHandle: 'out',
          target: 'cmd-0',
          targetHandle: 'in_arg_0',
        },
      ],
    };

    const ir = graphToTransactionIR(graph);
    const codes = ir.diagnostics.map((diagnostic) => diagnostic.code);

    expect(ir.commands).toEqual([]);
    expect(codes).toContain('graph.edge.node');
    expect(codes).not.toContain('ir.arg.input');
  });

  it('rejects duplicate node ids before graph conversion can collapse them', () => {
    const graph: PTBGraph = {
      nodes: [
        {
          id: 'var-0',
          kind: 'Variable',
          varType: { kind: 'scalar', name: 'string' },
          name: 'first',
          value: 'a',
          ports: [{ id: 'out', direction: 'out', role: 'io' }],
        },
        {
          id: 'var-0',
          kind: 'Variable',
          varType: { kind: 'scalar', name: 'string' },
          name: 'second',
          value: 'b',
          ports: [{ id: 'out', direction: 'out', role: 'io' }],
        },
      ],
      edges: [],
    };

    const ir = graphToTransactionIR(graph);

    expect(ir.commands).toEqual([]);
    expect(ir.inputs).toEqual([]);
    expect(ir.diagnostics.map((diagnostic) => diagnostic.code)).toContain(
      'graph.node.duplicate',
    );
  });

  it('rejects duplicate non-empty variable names before they become duplicate IR ids', () => {
    const graph: PTBGraph = {
      nodes: [
        {
          id: 'var-0',
          kind: 'Variable',
          varType: { kind: 'scalar', name: 'string' },
          name: 'same',
          value: 'a',
          ports: [{ id: 'out', direction: 'out', role: 'io' }],
        },
        {
          id: 'var-1',
          kind: 'Variable',
          varType: { kind: 'scalar', name: 'string' },
          name: 'same',
          value: 'b',
          ports: [{ id: 'out', direction: 'out', role: 'io' }],
        },
      ],
      edges: [],
    };

    const diagnostics = validatePTBGraph(graph);

    expect(diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'graph.variable.duplicateName',
        path: '$.nodes[1].name',
      }),
    );
  });

  it('allocates generated variable ids without colliding with explicit input-like names', () => {
    const graph: PTBGraph = {
      nodes: [
        {
          id: 'var-0',
          kind: 'Variable',
          varType: { kind: 'scalar', name: 'string' },
          name: '',
          value: 'first generated',
          ports: [{ id: 'out', direction: 'out', role: 'io' }],
        },
        {
          id: 'var-1',
          kind: 'Variable',
          varType: { kind: 'scalar', name: 'string' },
          name: 'input_0',
          value: 'explicit zero',
          ports: [{ id: 'out', direction: 'out', role: 'io' }],
        },
        {
          id: 'var-2',
          kind: 'Variable',
          varType: { kind: 'scalar', name: 'string' },
          name: '',
          value: 'second generated',
          ports: [{ id: 'out', direction: 'out', role: 'io' }],
        },
        {
          id: 'var-3',
          kind: 'Variable',
          varType: { kind: 'scalar', name: 'string' },
          name: 'input_1',
          value: 'explicit one',
          ports: [{ id: 'out', direction: 'out', role: 'io' }],
        },
      ],
      edges: [],
    };

    const ir = graphToTransactionIR(graph);

    expect(ir.inputs.map((input) => input.id)).toEqual([
      'input_2',
      'input_0',
      'input_3',
      'input_1',
    ]);
    expect(ir.diagnostics.map((diagnostic) => diagnostic.code)).not.toContain(
      'ir.input.duplicateId',
    );
  });

  it('rejects duplicate graph ports and invalid edge endpoint direction or role', () => {
    const graph: PTBGraph = {
      nodes: [
        {
          id: 'cmd-0',
          kind: 'Command',
          command: 'moveCall',
          params: { runtime: { target: `${normalizedObjectId('2')}::m::f` } },
          ports: [
            { id: 'in', direction: 'in', role: 'flow' },
            { id: 'out', direction: 'out', role: 'flow' },
            { id: 'in_arg_0', direction: 'in', role: 'io' },
            { id: 'in_arg_0', direction: 'in', role: 'io' },
          ],
        },
        {
          id: 'cmd-1',
          kind: 'Command',
          command: 'moveCall',
          params: { runtime: { target: `${normalizedObjectId('2')}::m::g` } },
          ports: [
            { id: 'in', direction: 'in', role: 'flow' },
            { id: 'out', direction: 'out', role: 'flow' },
            { id: 'in_arg_0', direction: 'in', role: 'io' },
          ],
        },
      ],
      edges: [
        {
          id: 'bad-io',
          kind: 'io',
          source: 'cmd-0',
          sourceHandle: 'in_arg_0',
          target: 'cmd-1',
          targetHandle: 'in_arg_0',
        },
        {
          id: 'bad-flow',
          kind: 'flow',
          source: 'cmd-0',
          sourceHandle: 'in_arg_0',
          target: 'cmd-1',
          targetHandle: 'in',
        },
      ],
    };

    const codes = graphToTransactionIR(graph).diagnostics.map(
      (diagnostic) => diagnostic.code,
    );

    expect(codes).toContain('graph.port.duplicate');
    expect(codes).toContain('graph.edge.direction');
    expect(codes).toContain('graph.edge.role');
  });

  it('rejects multiple IO edges into a single command input slot', () => {
    const graph: PTBGraph = {
      nodes: [
        {
          id: 'var-0',
          kind: 'Variable',
          varType: { kind: 'scalar', name: 'string' },
          name: 'input_0',
          value: 'a',
          ports: [{ id: 'out', direction: 'out', role: 'io' }],
        },
        {
          id: 'var-1',
          kind: 'Variable',
          varType: { kind: 'scalar', name: 'string' },
          name: 'input_1',
          value: 'b',
          ports: [{ id: 'out', direction: 'out', role: 'io' }],
        },
        {
          id: 'cmd-0',
          kind: 'Command',
          command: 'moveCall',
          params: { runtime: { target: `${normalizedObjectId('2')}::m::f` } },
          ports: [
            { id: 'in', direction: 'in', role: 'flow' },
            { id: 'out', direction: 'out', role: 'flow' },
            { id: 'in_arg_0', direction: 'in', role: 'io' },
          ],
        },
      ],
      edges: [
        {
          id: 'edge-0',
          kind: 'io',
          source: 'var-0',
          sourceHandle: 'out',
          target: 'cmd-0',
          targetHandle: 'in_arg_0',
        },
        {
          id: 'edge-1',
          kind: 'io',
          source: 'var-1',
          sourceHandle: 'out',
          target: 'cmd-0',
          targetHandle: 'in_arg_0',
        },
      ],
    };

    expect(
      graphToTransactionIR(graph).diagnostics.map(
        (diagnostic) => diagnostic.code,
      ),
    ).toContain('graph.edge.duplicateTarget');
  });

  it('keeps SplitCoins resultCount aligned with amount arguments', () => {
    const graph: PTBGraph = {
      nodes: [
        {
          id: 'gas',
          kind: 'Variable',
          varType: { kind: 'object' },
          name: 'gas',
          semantic: { kind: 'GasCoin' },
          ports: [{ id: 'out', direction: 'out', role: 'io' }],
        },
        {
          id: 'amount',
          kind: 'Variable',
          varType: { kind: 'move_numeric', width: 'u64' },
          name: 'amount',
          value: '1',
          ports: [{ id: 'out', direction: 'out', role: 'io' }],
        },
        {
          id: 'cmd-0',
          kind: 'Command',
          command: 'splitCoins',
          ports: [
            { id: 'in', direction: 'in', role: 'flow' },
            { id: 'out', direction: 'out', role: 'flow' },
            { id: 'in_coin', direction: 'in', role: 'io' },
            { id: 'in_amount_0', direction: 'in', role: 'io' },
          ],
        } as never,
      ],
      edges: [
        {
          id: 'coin-edge',
          kind: 'io',
          source: 'gas',
          sourceHandle: 'out',
          target: 'cmd-0',
          targetHandle: 'in_coin',
        },
        {
          id: 'amount-edge',
          kind: 'io',
          source: 'amount',
          sourceHandle: 'out',
          target: 'cmd-0',
          targetHandle: 'in_amount_0',
        },
      ],
    };

    const ir = graphToTransactionIR(graph);

    expect(ir.commands[0]).toMatchObject({
      kind: 'SplitCoins',
      resultCount: 1,
    });
    expect(ir.diagnostics).toEqual([]);
  });

  it('does not infer GasCoin from a variable id and name alone', () => {
    const graph: PTBGraph = {
      nodes: [
        {
          id: 'gas',
          kind: 'Variable',
          varType: { kind: 'move_numeric', width: 'u64' },
          name: 'gas',
          value: '1',
          ports: [{ id: 'out', direction: 'out', role: 'io' }],
        },
      ],
      edges: [],
    };

    const ir = graphToTransactionIR(graph);

    expect(ir.inputs).toEqual([
      {
        id: 'gas',
        kind: 'Pure',
        value: '1',
        type: { kind: 'move_numeric', width: 'u64' },
      },
    ]);
    expect(ir.diagnostics).toEqual([]);
  });

  it('does not synthesize empty graph command params for invalid publish or upgrade nodes', () => {
    const publishGraph: PTBGraph = {
      nodes: [
        {
          id: 'publish',
          kind: 'Command',
          command: 'publish',
          ports: [],
        },
      ],
      edges: [],
    };
    const upgradeGraph: PTBGraph = {
      nodes: [
        {
          id: 'upgrade',
          kind: 'Command',
          command: 'upgrade',
          params: {
            runtime: {
              modules: [],
              dependencies: [],
            },
          },
          ports: [],
        },
      ],
      edges: [],
    };

    const publishIR = graphToTransactionIR(publishGraph);
    const upgradeIR = graphToTransactionIR(upgradeGraph);

    expect(publishIR.commands[0]).toMatchObject({
      kind: 'Unsupported',
      sourceKind: 'InvalidPublishParams',
    });
    expect(upgradeIR.commands[0]).toMatchObject({
      kind: 'Unsupported',
      sourceKind: 'InvalidUpgradeParams',
    });
    expect(
      publishIR.diagnostics.map((diagnostic) => diagnostic.code),
    ).toContain('graph.command.base64BytesParam');
    expect(
      upgradeIR.diagnostics.map((diagnostic) => diagnostic.code),
    ).toContain('graph.command.objectIdParam');
  });

  it('does not synthesize empty MoveCall targets from invalid graph params', () => {
    const graph: PTBGraph = {
      nodes: [
        {
          id: 'cmd-0',
          kind: 'Command',
          command: 'moveCall',
          params: {
            runtime: { target: '0x2::coin' },
          },
          ports: [],
        },
      ],
      edges: [],
    };

    const ir = graphToTransactionIR(graph);

    expect(ir.commands[0]).toMatchObject({
      kind: 'Unsupported',
      sourceKind: 'InvalidMoveCallTarget',
    });
    expect(ir.diagnostics.map((diagnostic) => diagnostic.code)).toContain(
      'graph.command.moveCall.target',
    );
  });

  it('rejects non-canonical graph MoveCall package ids', () => {
    const graph: PTBGraph = {
      nodes: [
        {
          id: 'cmd-0',
          kind: 'Command',
          command: 'moveCall',
          params: {
            runtime: { target: '0x2::coin::value' },
          },
          ports: [],
        },
      ],
      edges: [],
    };

    const ir = graphToTransactionIR(graph);

    expect(ir.commands[0]).toMatchObject({
      kind: 'Unsupported',
      sourceKind: 'InvalidMoveCallTarget',
    });
    expect(ir.diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'graph.command.moveCall.package',
        path: '$.nodes[0]',
      }),
    );
  });

  it('rejects non-canonical graph Upgrade package ids', () => {
    const graph: PTBGraph = {
      nodes: [
        {
          id: 'ticket',
          kind: 'Variable',
          varType: { kind: 'object' },
          name: 'ticket',
          rawInput: {
            kind: 'Object',
            object: {
              kind: 'ImmOrOwnedObject',
              objectId: normalizedObjectId('9'),
              version: '1',
              digest: TEST_DIGEST_1,
            },
          },
          ports: [{ id: 'out', direction: 'out', role: 'io' }],
        },
        {
          id: 'upgrade',
          kind: 'Command',
          command: 'upgrade',
          params: {
            runtime: {
              modules: ['AQID'],
              dependencies: [normalizedObjectId('1')],
              package: '0x2',
            },
          },
          ports: [{ id: 'in_upgradeCap', direction: 'in', role: 'io' }],
        },
      ],
      edges: [
        {
          id: 'ticket-edge',
          kind: 'io',
          source: 'ticket',
          sourceHandle: 'out',
          target: 'upgrade',
          targetHandle: 'in_upgradeCap',
        },
      ],
    };

    const ir = graphToTransactionIR(graph);

    expect(ir.commands[0]).toMatchObject({
      kind: 'Unsupported',
      sourceKind: 'InvalidUpgradeParams',
    });
    expect(ir.diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'graph.command.objectIdParam',
        path: '$.nodes[1].params.runtime.package',
      }),
    );
  });

  it('declares only referenced graph output handles for unknown MoveCall nested results', () => {
    const ir: TransactionIR = {
      version: 'transaction_ir_1',
      inputs: [],
      diagnostics: [],
      commands: [
        {
          id: 'command_0',
          kind: 'MoveCall',
          package: normalizedObjectId('2'),
          module: 'coin',
          function: 'split',
          typeArguments: [],
          arguments: [],
        },
        {
          id: 'command_1',
          kind: 'MoveCall',
          package: normalizedObjectId('2'),
          module: 'coin',
          function: 'value',
          typeArguments: [],
          arguments: [
            { kind: 'NestedResult', commandIndex: 0, resultIndex: 5 },
          ],
        },
      ],
    };
    const graph = transactionIRToGraph(ir);
    const source = graph.nodes.find((node) => node.id === 'cmd-0');
    const sourcePorts = source?.ports.map((port) => port.id);

    expect(sourcePorts).toContain('out_5');
    expect(sourcePorts).not.toContain('out_0');
    expect(graphEdgesHaveDeclaredHandles(graph)).toBe(true);
  });

  it('does not expose nested result handles for single-result package commands', () => {
    const ir: TransactionIR = {
      version: 'transaction_ir_1',
      inputs: [
        {
          id: 'ticket',
          kind: 'Object',
          object: {
            kind: 'ImmOrOwnedObject',
            objectId: normalizedObjectId('7'),
            version: '1',
            digest: TEST_DIGEST_1,
          },
        },
      ],
      diagnostics: [],
      commands: [
        {
          id: 'publish',
          kind: 'Publish',
          modules: ['AA=='],
          dependencies: [],
          resultCount: 1,
        },
        {
          id: 'makeMoveVec',
          kind: 'MakeMoveVec',
          type: 'u64',
          elements: [],
          resultCount: 1,
        },
        {
          id: 'upgrade',
          kind: 'Upgrade',
          modules: ['AA=='],
          dependencies: [],
          package: normalizedObjectId('2'),
          ticket: { kind: 'Input', index: 0 },
          resultCount: 1,
        },
      ],
    };

    const graph = transactionIRToGraph(ir);
    const commandPorts = graph.nodes
      .filter((node): node is CommandNode => node.kind === 'Command')
      .map((node) => node.ports.map((port) => port.id));

    commandPorts.forEach((ports) => {
      expect(ports).toContain('out_result');
      expect(ports).not.toContain('out_0');
    });
    expect(graphEdgesHaveDeclaredHandles(graph)).toBe(true);
  });

  it('declares nested handles for single-result package commands when IR references them', () => {
    const ir: TransactionIR = {
      version: 'transaction_ir_1',
      inputs: [
        {
          id: 'ticket',
          kind: 'Object',
          object: {
            kind: 'ImmOrOwnedObject',
            objectId: normalizedObjectId('7'),
            version: '1',
            digest: TEST_DIGEST_1,
          },
        },
      ],
      diagnostics: [],
      commands: [
        {
          id: 'publish',
          kind: 'Publish',
          modules: ['AA=='],
          dependencies: [],
          resultCount: 1,
        },
        {
          id: 'makeMoveVec',
          kind: 'MakeMoveVec',
          type: 'u64',
          elements: [],
          resultCount: 1,
        },
        {
          id: 'upgrade',
          kind: 'Upgrade',
          modules: ['AA=='],
          dependencies: [],
          package: normalizedObjectId('2'),
          ticket: { kind: 'Input', index: 0 },
          resultCount: 1,
        },
        {
          id: 'consumer',
          kind: 'MoveCall',
          package: normalizedObjectId('2'),
          module: 'coin',
          function: 'value',
          typeArguments: [],
          arguments: [
            { kind: 'NestedResult', commandIndex: 0, resultIndex: 0 },
            { kind: 'NestedResult', commandIndex: 1, resultIndex: 0 },
            { kind: 'NestedResult', commandIndex: 2, resultIndex: 0 },
          ],
          resultCount: 0,
        },
      ],
    };

    const graph = transactionIRToGraph(ir);
    const commandPorts = graph.nodes
      .filter((node): node is CommandNode => node.kind === 'Command')
      .map((node) => node.ports.map((port) => port.id));

    commandPorts.slice(0, 3).forEach((ports) => {
      expect(ports).toContain('out_result');
      expect(ports).toContain('out_0');
    });
    expect(graphEdgesHaveDeclaredHandles(graph)).toBe(true);
    expect(graphToTransactionIR(graph).diagnostics).toEqual([]);
  });

  it('does not expose Result handles for known multi-result commands', () => {
    const ir: TransactionIR = {
      version: 'transaction_ir_1',
      inputs: [
        { id: 'amount0', kind: 'Pure', bytes: 'AA==' },
        { id: 'amount1', kind: 'Pure', bytes: 'AQ==' },
      ],
      diagnostics: [],
      commands: [
        {
          id: 'split',
          kind: 'SplitCoins',
          coin: { kind: 'GasCoin' },
          amounts: [
            { kind: 'Input', index: 0 },
            { kind: 'Input', index: 1 },
          ],
          resultCount: 2,
        },
      ],
    };

    const graph = transactionIRToGraph(ir);
    const split = graph.nodes.find((node) => node.id === 'cmd-0');
    const ports = split?.ports.map((port) => port.id);

    expect(ports).toContain('out_0');
    expect(ports).toContain('out_1');
    expect(ports).not.toContain('out_result');
    expect(graphEdgesHaveDeclaredHandles(graph)).toBe(true);
  });

  it('does not synthesize empty UI params for MoveCall graph nodes', () => {
    const ir: TransactionIR = {
      version: 'transaction_ir_1',
      inputs: [],
      diagnostics: [],
      commands: [
        {
          id: 'command_0',
          kind: 'MoveCall',
          package: normalizedObjectId('2'),
          module: 'coin',
          function: 'value',
          typeArguments: [],
          arguments: [],
        },
      ],
    };

    const graph = transactionIRToGraph(ir);
    const command = graph.nodes.find(
      (node): node is CommandNode => node.kind === 'Command',
    );

    expect(command?.params).toEqual({
      runtime: {
        target: `${normalizedObjectId('2')}::coin::value`,
        typeArguments: [],
      },
    });
  });

  it('preserves unsupported commands through graph conversion', () => {
    const ir: TransactionIR = {
      version: 'transaction_ir_1',
      inputs: [],
      diagnostics: [],
      commands: [
        {
          id: 'command_0',
          kind: 'Unsupported',
          sourceKind: 'FutureCommand',
          value: { kind: 'FutureCommand', payload: 1 },
          resultCount: 0,
        },
      ],
    };

    const graph = transactionIRToGraph(ir);
    const commandNode = graph.nodes.find((node) => node.kind === 'Command');
    const roundTripped = graphToTransactionIR(graph);

    expect(commandNode).toMatchObject({
      kind: 'Command',
      command: 'unsupported',
      params: {
        runtime: {
          sourceKind: 'FutureCommand',
          value: { kind: 'FutureCommand', payload: 1 },
        },
      },
    });
    expect(roundTripped.commands[0]).toMatchObject({
      kind: 'Unsupported',
      sourceKind: 'FutureCommand',
      value: { kind: 'FutureCommand', payload: 1 },
      resultCount: 0,
    });
  });

  it('preserves unsupported inputs through graph conversion', () => {
    const ir: TransactionIR = {
      version: 'transaction_ir_1',
      inputs: [
        {
          id: 'input_0',
          kind: 'Unsupported',
          sourceKind: 'FutureInput',
          value: { kind: 'FutureInput', payload: 1 },
        },
      ],
      commands: [],
      diagnostics: [],
    };

    const graph = transactionIRToGraph(ir);
    const variableNode = graph.nodes.find((node) => node.id === 'var-0');
    const roundTripped = graphToTransactionIR(graph);

    expect(variableNode).toMatchObject({
      kind: 'Variable',
      semantic: { kind: 'UnsupportedInput', sourceKind: 'FutureInput' },
      value: { kind: 'FutureInput', payload: 1 },
    });
    expect(roundTripped.inputs[0]).toMatchObject({
      kind: 'Unsupported',
      sourceKind: 'FutureInput',
      value: { kind: 'FutureInput', payload: 1 },
    });
  });

  it('preserves deeply nested unsupported graph values without recursive cloning', () => {
    const root: Record<string, unknown> = { kind: 'FutureInput' };
    let cursor = root;
    for (let index = 0; index < 10000; index += 1) {
      const next: Record<string, unknown> = {};
      cursor.next = next;
      cursor = next;
    }
    cursor.done = true;

    const roundTripped = graphToTransactionIR({
      nodes: [
        {
          id: 'var-0',
          kind: 'Variable',
          name: 'input_0',
          varType: { kind: 'unknown' },
          ports: [],
          semantic: { kind: 'UnsupportedInput', sourceKind: 'FutureInput' },
          value: root,
        },
      ],
      edges: [],
    });

    expect(roundTripped.inputs[0].kind).toBe('Unsupported');
    if (roundTripped.inputs[0].kind === 'Unsupported') {
      expect(roundTripped.inputs[0].sourceKind).toBe('FutureInput');
      expect(Object.is(roundTripped.inputs[0].value, root)).toBe(false);
      let cloned = roundTripped.inputs[0].value as Record<string, unknown>;
      for (let index = 0; index < 10000; index += 1) {
        cloned = cloned.next as Record<string, unknown>;
      }
      expect(cloned.done).toBe(true);
    }
  });

  it('returns graph diagnostics instead of throwing for malformed graph input', () => {
    const ir = graphToTransactionIR({
      nodes: [
        {
          id: 'cmd-0',
          kind: 'Command',
          command: 'moveCall',
          ports: [{ id: 'in', direction: 'sideways', role: 'flow' }],
        },
      ],
      edges: [],
    } as unknown as PTBGraph);

    expect(ir.commands).toEqual([]);
    expect(ir.diagnostics.map((diagnostic) => diagnostic.code)).toContain(
      'graph.port.direction',
    );
  });

  it('rejects invalid IR before creating graph edges to missing nodes', () => {
    const ir: TransactionIR = {
      version: 'transaction_ir_1',
      inputs: [],
      diagnostics: [],
      commands: [
        {
          id: 'command_0',
          kind: 'MoveCall',
          package: normalizedObjectId('2'),
          module: 'm',
          function: 'f',
          typeArguments: [],
          arguments: [{ kind: 'Input', index: 0.5 }],
        },
      ],
    };

    expect(() => transactionIRToGraph(ir)).toThrow(
      /cannot be converted to PTBGraph/,
    );
  });
});

describe('validateTransactionIR', () => {
  it('rejects future result references', () => {
    const ir: TransactionIR = {
      version: 'transaction_ir_1',
      inputs: [],
      diagnostics: [],
      commands: [
        {
          id: 'command_0',
          kind: 'MoveCall',
          package: normalizedObjectId('2'),
          module: 'm',
          function: 'f',
          typeArguments: [],
          arguments: [{ kind: 'Result', commandIndex: 1 }],
        },
        {
          id: 'command_1',
          kind: 'Publish',
          modules: [],
          dependencies: [],
          resultCount: 1,
        },
      ],
    };

    expect(
      validateTransactionIR(ir).map((diagnostic) => diagnostic.code),
    ).toContain('ir.arg.futureResult');
  });

  it('rejects manual IR MoveCall _argumentTypes outside the SDK OpenSignature schema', () => {
    const diagnostics = validateTransactionIR({
      version: 'transaction_ir_1',
      inputs: [],
      diagnostics: [],
      commands: [
        {
          id: 'call',
          kind: 'MoveCall',
          package: normalizedObjectId('2'),
          module: 'm',
          function: 'f',
          typeArguments: [],
          arguments: [],
          _argumentTypes: [{ reference: 'readonly', body: { $kind: 'u64' } }],
        },
      ],
    });

    expect(diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'ir.command.argumentTypes',
        path: '$.commands[0]._argumentTypes',
      }),
    );
  });

  it('reports argument diagnostics at the actual command fields', () => {
    const diagnostics = validateTransactionIR({
      version: 'transaction_ir_1',
      inputs: [],
      diagnostics: [],
      commands: [
        {
          id: 'split',
          kind: 'SplitCoins',
          coin: { kind: 'Input', index: 0 },
          amounts: [{ kind: 'Input', index: 1 }],
          resultCount: 1,
        },
      ],
    });

    expect(diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'ir.arg.input',
        path: '$.commands[0].coin',
      }),
    );
    expect(diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'ir.arg.input',
        path: '$.commands[0].amounts[0]',
      }),
    );
  });

  it('rejects Result references to known multi-result commands', () => {
    const diagnostics = validateTransactionIR({
      version: 'transaction_ir_1',
      inputs: [
        { id: 'amount0', kind: 'Pure', bytes: 'AA==' },
        { id: 'amount1', kind: 'Pure', bytes: 'AQ==' },
      ],
      diagnostics: [],
      commands: [
        {
          id: 'split',
          kind: 'SplitCoins',
          coin: { kind: 'GasCoin' },
          amounts: [
            { kind: 'Input', index: 0 },
            { kind: 'Input', index: 1 },
          ],
          resultCount: 2,
        },
        {
          id: 'consumer',
          kind: 'MoveCall',
          package: normalizedObjectId('2'),
          module: 'coin',
          function: 'value',
          typeArguments: [],
          arguments: [{ kind: 'Result', commandIndex: 0 }],
        },
      ],
    });

    expect(diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'ir.arg.resultArity',
        path: '$.commands[1].arguments[0]',
      }),
    );
  });

  it('rejects non-integer indexes and result counts at runtime', () => {
    const ir: TransactionIR = {
      version: 'transaction_ir_1',
      inputs: [
        {
          id: 'input_0',
          kind: 'Pure',
          value: 1,
          type: { kind: 'move_numeric', width: 'u64' },
        },
      ],
      diagnostics: [],
      commands: [
        {
          id: 'command_0',
          kind: 'SplitCoins',
          coin: { kind: 'GasCoin' },
          amounts: [{ kind: 'Input', index: Number.NaN }],
          resultCount: 1.5,
        },
        {
          id: 'command_1',
          kind: 'Publish',
          modules: [],
          dependencies: [],
          resultCount: 1,
        },
        {
          id: 'command_2',
          kind: 'MoveCall',
          package: normalizedObjectId('2'),
          module: 'm',
          function: 'f',
          typeArguments: [],
          arguments: [
            {
              kind: 'NestedResult',
              commandIndex: 1,
              resultIndex: 0.5,
            },
          ],
        },
      ],
    };

    const codes = validateTransactionIR(ir).map(
      (diagnostic) => diagnostic.code,
    );

    expect(codes).toContain('ir.arg.input');
    expect(codes).toContain('ir.command.resultCount');
    expect(codes).toContain('ir.arg.nestedResult');
  });

  it('rejects invalid nested result indexes when target resultCount is unknown', () => {
    const ir: TransactionIR = {
      version: 'transaction_ir_1',
      inputs: [],
      diagnostics: [],
      commands: [
        {
          id: 'command_0',
          kind: 'MoveCall',
          package: normalizedObjectId('2'),
          module: 'coin',
          function: 'split',
          typeArguments: [],
          arguments: [],
        },
        {
          id: 'command_1',
          kind: 'MoveCall',
          package: normalizedObjectId('2'),
          module: 'coin',
          function: 'value',
          typeArguments: [],
          arguments: [
            {
              kind: 'NestedResult',
              commandIndex: 0,
              resultIndex: 65_536,
            },
          ],
        },
      ],
    };

    const codes = validateTransactionIR(ir).map(
      (diagnostic) => diagnostic.code,
    );

    expect(codes).toContain('ir.arg.nestedResult');
  });

  it('rejects resultCount values that cannot be addressed by u16 result indexes', () => {
    const codes = validateTransactionIR({
      version: 'transaction_ir_1',
      inputs: [],
      diagnostics: [],
      commands: [
        {
          id: 'command_0',
          kind: 'MoveCall',
          package: normalizedObjectId('2'),
          module: 'coin',
          function: 'split',
          typeArguments: [],
          arguments: [],
          resultCount: 65_537,
        },
      ],
    }).map((diagnostic) => diagnostic.code);

    expect(codes).toContain('ir.command.resultCount');
  });

  it('rejects resultCount values that disagree with command semantics', () => {
    const codes = validateTransactionIR({
      version: 'transaction_ir_1',
      inputs: [
        {
          id: 'input_0',
          kind: 'Pure',
          value: 1,
          type: { kind: 'move_numeric', width: 'u64' },
        },
      ],
      diagnostics: [],
      commands: [
        {
          id: 'command_0',
          kind: 'SplitCoins',
          coin: { kind: 'GasCoin' },
          amounts: [{ kind: 'Input', index: 0 }],
          resultCount: 2,
        },
      ],
    }).map((diagnostic) => diagnostic.code);

    expect(codes).toContain('ir.command.resultCount');
  });

  it('reports raw-conversion-only requirements as PTBModelError diagnostics', () => {
    const ir: TransactionIR = {
      version: 'transaction_ir_1',
      inputs: [
        {
          id: 'input_0',
          kind: 'Pure',
          value: 1,
          type: { kind: 'move_numeric', width: 'u64' },
        },
      ],
      diagnostics: [],
      commands: [],
    };

    expectModelErrorCodes(() => transactionIRToRaw(ir), ['raw.ir.pureBytes']);
  });

  it('rejects pure inputs that combine raw bytes with a typed display value across conversion paths', () => {
    const ir: TransactionIR = {
      version: 'transaction_ir_1',
      inputs: [
        {
          id: 'conflictingPure',
          kind: 'Pure',
          bytes: 'AQID',
          value: 7,
          type: { kind: 'move_numeric', width: 'u64' },
        },
      ],
      diagnostics: [],
      commands: [],
    };

    expect(validateTransactionIR(ir)).toContainEqual(
      expect.objectContaining({
        code: 'ir.input.pureRedundant',
        path: '$.inputs[0]',
      }),
    );
    expectModelErrorCodes(
      () => transactionIRToRaw(ir),
      ['ir.input.pureRedundant'],
    );
    expectModelErrorCodes(
      () => transactionIRToGraph(ir),
      ['ir.input.pureRedundant'],
    );
  });

  it('rejects typed pure inputs that omit either value or type', () => {
    const missingValue: TransactionIR = {
      version: 'transaction_ir_1',
      inputs: [
        {
          id: 'implicitNone',
          kind: 'Pure',
          type: {
            kind: 'option',
            elem: { kind: 'move_numeric', width: 'u64' },
          },
        },
      ],
      diagnostics: [],
      commands: [],
    };
    const missingType: TransactionIR = {
      version: 'transaction_ir_1',
      inputs: [
        {
          id: 'untypedValue',
          kind: 'Pure',
          value: 1,
        },
      ],
      diagnostics: [],
      commands: [],
    };

    expect(validateTransactionIR(missingValue)).toContainEqual(
      expect.objectContaining({
        code: 'ir.input.pureValue',
        path: '$.inputs[0]',
      }),
    );
    expectModelErrorCodes(
      () => transactionIRToGraph(missingValue),
      ['ir.input.pureValue'],
    );
    expectModelErrorCodes(
      () => transactionIRToTsSdkCode(missingValue),
      ['ir.input.pureValue'],
    );
    expect(validateTransactionIR(missingType)).toContainEqual(
      expect.objectContaining({
        code: 'ir.input.pureType',
        path: '$.inputs[0].type',
      }),
    );
  });

  it('raw conversion validates the current IR shape instead of stale stored diagnostics', () => {
    const stale = rawTransactionToIR({
      inputs: [
        { $kind: 'UnresolvedObject', UnresolvedObject: { objectId: '0x2' } },
      ],
      commands: [],
    });
    const repaired: TransactionIR = {
      ...stale,
      inputs: [
        {
          id: 'input_0',
          kind: 'Object',
          object: {
            kind: 'ImmOrOwnedObject',
            objectId: normalizedObjectId('2'),
            version: '1',
            digest: TEST_DIGEST_1,
          },
        },
      ],
    };

    expect(transactionIRToRaw(repaired)).toEqual({
      inputs: [
        {
          kind: 'Object',
          object: {
            kind: 'ImmOrOwnedObject',
            objectId: normalizedObjectId('2'),
            version: '1',
            digest: TEST_DIGEST_1,
          },
        },
      ],
      commands: [],
    });
  });

  it('conversion APIs still reject malformed stored diagnostics', () => {
    const ir = {
      version: 'transaction_ir_1',
      inputs: [{ id: 'input_0', kind: 'Pure', bytes: 'AA==' }],
      commands: [],
      diagnostics: [{ code: 'missing required diagnostic fields' }],
    } as unknown as TransactionIR;

    expectModelErrorCodes(() => transactionIRToRaw(ir), ['ir.diagnostic']);
    expectModelErrorCodes(() => transactionIRToGraph(ir), ['ir.diagnostic']);
    expectModelErrorCodes(
      () => transactionIRToTsSdkCode(ir),
      ['ir.diagnostic'],
    );
  });

  it('returns diagnostics for malformed IR objects instead of throwing', () => {
    const codes = validateTransactionIR({
      version: 'transaction_ir_1',
      inputs: [NULL_VALUE],
      commands: [
        {
          id: 'command_0',
          kind: 'MoveCall',
          package: normalizedObjectId('2'),
          module: 'm',
          function: 'f',
          typeArguments: [],
        },
      ],
      diagnostics: [{ code: 'broken' }],
    }).map((diagnostic) => diagnostic.code);

    expect(codes).toContain('ir.input');
    expect(codes).toContain('ir.command.field');
    expect(codes).toContain('ir.diagnostic');
  });

  it('rejects duplicate TransactionIR input and command ids', () => {
    const diagnostics = validateTransactionIR({
      version: 'transaction_ir_1',
      diagnostics: [],
      inputs: [
        { id: 'input_0', kind: 'Pure', bytes: 'AA==' },
        { id: 'input_0', kind: 'Pure', bytes: 'AQ==' },
      ],
      commands: [
        {
          id: 'command_0',
          kind: 'Publish',
          modules: ['AA=='],
          dependencies: [],
        },
        {
          id: 'command_0',
          kind: 'Publish',
          modules: ['AQ=='],
          dependencies: [],
        },
      ],
    });

    expect(diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'ir.input.duplicateId',
        path: '$.inputs[1].id',
      }),
    );
    expect(diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'ir.command.duplicateId',
        path: '$.commands[1].id',
      }),
    );
  });

  it('rejects empty TransactionIR input and command ids', () => {
    const diagnostics = validateTransactionIR({
      version: 'transaction_ir_1',
      diagnostics: [],
      inputs: [{ id: '', kind: 'Pure', bytes: 'AA==' }],
      commands: [
        { id: '', kind: 'Publish', modules: ['AA=='], dependencies: [] },
      ],
    });

    expect(diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'ir.input.id',
        path: '$.inputs[0].id',
      }),
    );
    expect(diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'ir.command.id',
        path: '$.commands[0].id',
      }),
    );
  });

  it('rejects Input argument type metadata that does not match the referenced input kind', () => {
    const diagnostics = validateTransactionIR({
      version: 'transaction_ir_1',
      diagnostics: [],
      inputs: [{ id: 'input_0', kind: 'Pure', bytes: 'AA==' }],
      commands: [
        {
          id: 'command_0',
          kind: 'TransferObjects',
          objects: [{ kind: 'Input', index: 0, type: 'object' }],
          address: { kind: 'Input', index: 0, type: 'pure' },
          resultCount: 0,
        },
      ],
    });

    expect(diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'ir.arg.typeMismatch',
        path: '$.commands[0].objects[0].type',
      }),
    );
  });

  it('rejects command input references whose source kind cannot satisfy the command argument', () => {
    const diagnostics = validateTransactionIR({
      version: 'transaction_ir_1',
      diagnostics: [],
      inputs: [
        { id: 'recipientObject', kind: 'Object' },
        { id: 'coinValue', kind: 'Pure', bytes: 'AA==' },
      ],
      commands: [
        {
          id: 'transfer',
          kind: 'TransferObjects',
          objects: [{ kind: 'GasCoin' }],
          address: { kind: 'Input', index: 0 },
          resultCount: 0,
        },
        {
          id: 'split',
          kind: 'SplitCoins',
          coin: { kind: 'Input', index: 1 },
          amounts: [{ kind: 'Input', index: 0 }],
          resultCount: 1,
        },
      ],
    });

    expect(diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'ir.arg.semanticType',
        path: '$.commands[0].address',
      }),
    );
    expect(diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'ir.arg.semanticType',
        path: '$.commands[1].coin',
      }),
    );
    expect(diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'ir.arg.semanticType',
        path: '$.commands[1].amounts[0]',
      }),
    );
  });

  it('rejects canonicalRaw values that do not match the IR item', () => {
    const diagnostics = validateTransactionIR({
      version: 'transaction_ir_1',
      diagnostics: [],
      inputs: [
        {
          id: 'input_0',
          kind: 'Pure',
          bytes: 'AA==',
          canonicalRaw: { kind: 'Pure', bytes: 'AQ==' },
        },
      ],
      commands: [
        {
          id: 'command_0',
          kind: 'Publish',
          modules: ['AA=='],
          dependencies: [],
          resultCount: 1,
          canonicalRaw: {
            kind: 'Publish',
            modules: ['AQ=='],
            dependencies: [],
          },
        },
      ],
    });

    expect(diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'ir.input.canonicalRaw',
        path: '$.inputs[0].canonicalRaw',
      }),
    );
    expect(diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'ir.command.canonicalRaw',
        path: '$.commands[0].canonicalRaw',
      }),
    );
  });

  it('rejects diagnostic level fields instead of accepting inert warnings', () => {
    const codes = validateTransactionIR({
      version: 'transaction_ir_1',
      inputs: [],
      commands: [],
      diagnostics: [
        {
          level: 'warning',
          code: 'external.warning',
          message: 'warnings are not a model diagnostic level',
        },
      ],
    }).map((diagnostic) => diagnostic.code);

    expect(codes).toContain('ir.diagnostic');
  });

  it('emits canonical diagnostics without severity level fields', () => {
    const diagnostics = validateTransactionIR({
      version: 'wrong',
      inputs: [],
      commands: [],
      diagnostics: [],
    });

    expect(diagnostics[0]).toEqual({
      code: 'ir.version',
      message: 'TransactionIR version must be transaction_ir_1.',
      path: '$.version',
    });
    expect(Object.prototype.hasOwnProperty.call(diagnostics[0], 'level')).toBe(
      false,
    );
  });

  it('rejects unknown fields in direct TransactionIR literals', () => {
    const diagnostics = validateTransactionIR({
      version: 'transaction_ir_1',
      inputs: [
        {
          id: 'input_0',
          kind: 'Pure',
          bytes: 'AQID',
          extraInputField: true,
        },
      ],
      commands: [
        {
          id: 'publish',
          kind: 'Publish',
          modules: ['AQID'],
          dependencies: [],
          resultCount: 1,
          extraCommandField: true,
        },
        {
          id: 'move',
          kind: 'MoveCall',
          package: normalizedObjectId('2'),
          module: 'm',
          function: 'f',
          typeArguments: [],
          arguments: [{ kind: 'Input', index: 0, extraArgField: true }],
        },
      ],
      diagnostics: [],
      extraRootField: true,
    });

    expect(diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'ir.unknownField',
        path: '$.extraRootField',
      }),
    );
    expect(diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'ir.input.unknownField',
        path: '$.inputs[0].extraInputField',
      }),
    );
    expect(diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'ir.command.unknownField',
        path: '$.commands[0].extraCommandField',
      }),
    );
    expect(diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'ir.arg.unknownField',
        path: '$.commands[1].arguments[0].extraArgField',
      }),
    );
  });

  it('rejects raw scalar data outside Sui and SDK boundaries in manual IR', () => {
    const diagnostics = validateTransactionIR({
      version: 'transaction_ir_1',
      inputs: [
        {
          id: 'pure',
          kind: 'Pure',
          bytes: 'A',
        },
        {
          id: 'object',
          kind: 'Object',
          object: {
            kind: 'ImmOrOwnedObject',
            objectId: 'not-an-object-id',
            version: '-1',
            digest: TEST_DIGEST_1,
          },
        },
        {
          id: 'funds',
          kind: 'FundsWithdrawal',
          value: {
            reservation: {
              kind: 'MaxAmountU64',
              amount: '18446744073709551616',
            },
            typeArg: { kind: 'Balance', type: TEST_SUI_TYPE },
            withdrawFrom: { kind: 'Sender' },
          },
        },
      ],
      commands: [
        {
          id: 'publish',
          kind: 'Publish',
          modules: ['AQID', '@@@'],
          dependencies: [],
          resultCount: 1,
        },
      ],
      diagnostics: [],
    });

    expect(diagnostics.map((diagnostic) => diagnostic.code)).toEqual(
      expect.arrayContaining([
        'ir.input.pure',
        'ir.input.object',
        'ir.input.fundsWithdrawal',
        'ir.command.base64Bytes',
      ]),
    );
    expect(diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'ir.command.base64Bytes',
        path: '$.commands[0].modules[1]',
      }),
    );
  });

  it('diagnoses Sui command validity empty-input cases in manual IR', () => {
    const diagnostics = validateTransactionIR({
      version: 'transaction_ir_1',
      inputs: [{ id: 'input_0', kind: 'Pure', bytes: 'AQID' }],
      commands: [
        {
          id: 'transfer',
          kind: 'TransferObjects',
          objects: [],
          address: { kind: 'Input', index: 0 },
          resultCount: 0,
        },
        {
          id: 'split',
          kind: 'SplitCoins',
          coin: { kind: 'GasCoin' },
          amounts: [],
          resultCount: 0,
        },
        {
          id: 'merge',
          kind: 'MergeCoins',
          destination: { kind: 'GasCoin' },
          sources: [],
          resultCount: 0,
        },
        {
          id: 'makeMoveVec',
          kind: 'MakeMoveVec',
          type: NULL_VALUE,
          elements: [],
          resultCount: 1,
        },
        {
          id: 'publish',
          kind: 'Publish',
          modules: [],
          dependencies: [],
          resultCount: 1,
        },
        {
          id: 'upgrade',
          kind: 'Upgrade',
          modules: [],
          dependencies: [],
          package: normalizedObjectId('1'),
          ticket: { kind: 'GasCoin' },
          resultCount: 1,
        },
      ],
      diagnostics: [],
    });

    expect(
      diagnostics.filter(
        (diagnostic) => diagnostic.code === 'ir.command.emptyInput',
      ),
    ).toHaveLength(6);
  });

  it('rejects cyclic PTBType values without recursing forever', () => {
    const cyclicType: Record<string, unknown> = { kind: 'vector' };
    cyclicType.elem = cyclicType;

    const codes = validateTransactionIR({
      version: 'transaction_ir_1',
      inputs: [
        {
          id: 'input_0',
          kind: 'Pure',
          value: [],
          type: cyclicType,
        },
      ],
      commands: [],
      diagnostics: [],
    }).map((diagnostic) => diagnostic.code);

    expect(codes).toContain('graph.type.cycle');
  });

  it('does not duplicate existing diagnostics when validating repeatedly', () => {
    const ir = rawTransactionToIR({
      inputs: [{ $kind: 'UnresolvedPure', UnresolvedPure: { value: 1 } }],
      commands: [],
    });

    const once = validateTransactionIR(ir);
    const twice = validateTransactionIR({ ...ir, diagnostics: once });

    expect(twice).toEqual(once);
  });

  it('freezes PTBModelError diagnostics arrays after throwing', () => {
    expect(() =>
      transactionIRToRaw({
        version: 'transaction_ir_1',
        inputs: [{ id: 'missingBytes', kind: 'Pure' }],
        commands: [],
        diagnostics: [],
      }),
    ).toThrow(PTBModelError);

    try {
      transactionIRToRaw({
        version: 'transaction_ir_1',
        inputs: [{ id: 'missingBytes', kind: 'Pure' }],
        commands: [],
        diagnostics: [],
      });
    } catch (error) {
      expect(error).toBeInstanceOf(PTBModelError);
      const modelError = error as PTBModelError;
      expect(Object.isFrozen(modelError.diagnostics)).toBe(true);
      expect(Object.isFrozen(modelError.diagnostics[0])).toBe(true);
      expect(() =>
        (modelError.diagnostics as unknown[]).push(modelError.diagnostics[0]),
      ).toThrow();
      expect(() => {
        (modelError.diagnostics[0] as { code: string }).code = 'mutated';
      }).toThrow();
    }
  });

  it('returns frozen diagnostics arrays from public validation boundaries', () => {
    const ir = rawTransactionToIR({
      inputs: [{ kind: 'Pure', bytes: 'A' }],
      commands: [],
    });
    const irDiagnostics = validateTransactionIR({
      version: 'wrong',
      inputs: [],
      commands: [],
      diagnostics: [],
    });
    const malformedShapeDiagnostics = validateTransactionIR({
      version: 'transaction_ir_1',
      inputs: 'not-an-array',
      commands: [],
      diagnostics: [],
    });
    const graphDiagnostics = validatePTBGraph({
      unexpected: true,
      nodes: [],
      edges: [],
    });
    const docDiagnostics = validatePTBDocV4({
      version: 'ptb_4',
      graph: { nodes: [], edges: [] },
      unexpected: true,
    });

    [
      ir.diagnostics,
      irDiagnostics,
      malformedShapeDiagnostics,
      graphDiagnostics,
      docDiagnostics,
    ].forEach((diagnostics) => {
      expect(Object.isFrozen(diagnostics)).toBe(true);
      expect(Object.isFrozen(diagnostics[0])).toBe(true);
      expect(() => (diagnostics as unknown[]).pop()).toThrow();
      expect(() => {
        (diagnostics[0] as { code: string }).code = 'mutated';
      }).toThrow();
    });
  });

  it('exports freezeDiagnostics for host-built diagnostics', () => {
    const diagnostics = freezeDiagnostics([
      {
        code: 'host.diagnostic',
        message: 'Host-built diagnostic.',
        path: '$',
      },
    ]);
    const repeated = freezeDiagnostics(diagnostics);

    expect(repeated).toBe(diagnostics);
    expect(Object.isFrozen(diagnostics)).toBe(true);
    expect(Object.isFrozen(diagnostics[0])).toBe(true);
    expect(() => (diagnostics as unknown[]).push(diagnostics[0])).toThrow();
    expect(() => {
      (diagnostics[0] as { code: string }).code = 'mutated';
    }).toThrow();
    expect(() =>
      freezeDiagnostics(
        Object.freeze([
          Object.freeze({
            code: 1,
            message: 'Malformed diagnostic.',
          }),
        ]) as unknown as TransactionIR['diagnostics'],
      ),
    ).toThrow(TypeError);
  });

  it('rejects sparse arrays at model trust boundaries', () => {
    const sparse = new Array(1);

    expect(() =>
      freezeDiagnostics(sparse as unknown as TransactionIR['diagnostics']),
    ).toThrow(TypeError);

    expect(
      validateTransactionIR({
        version: 'transaction_ir_1',
        inputs: sparse,
        commands: [],
        diagnostics: [],
      }).map((diagnostic) => diagnostic.code),
    ).toContain('ir.inputs');
    expect(
      validateTransactionIR({
        version: 'transaction_ir_1',
        inputs: [],
        commands: sparse,
        diagnostics: [],
      }).map((diagnostic) => diagnostic.code),
    ).toContain('ir.commands');
    expect(
      validateTransactionIR({
        version: 'transaction_ir_1',
        inputs: [],
        commands: [
          {
            id: 'move',
            kind: 'MoveCall',
            package: normalizedObjectId('2'),
            module: 'm',
            function: 'f',
            typeArguments: [],
            arguments: sparse,
          },
        ],
        diagnostics: [],
      }).map((diagnostic) => diagnostic.code),
    ).toContain('ir.command.field');
    expect(
      validateTransactionIR({
        version: 'transaction_ir_1',
        inputs: [],
        commands: [],
        diagnostics: sparse,
      }).map((diagnostic) => diagnostic.code),
    ).toContain('ir.diagnostics');

    expect(
      rawTransactionToIR({ inputs: sparse, commands: [] }).diagnostics.map(
        (diagnostic) => diagnostic.code,
      ),
    ).toContain('raw.transaction');
    expect(
      rawTransactionToIR({
        inputs: [],
        commands: [{ kind: 'Publish', modules: sparse, dependencies: [] }],
      }).diagnostics.map((diagnostic) => diagnostic.code),
    ).toContain('raw.base64Bytes');
    expect(
      rawTransactionToIR({
        inputs: [],
        commands: [
          {
            kind: 'MoveCall',
            call: {
              package: normalizedObjectId('2'),
              module: 'm',
              function: 'f',
              typeArguments: [],
              arguments: [],
              _argumentTypes: sparse,
            },
          },
        ],
      }).diagnostics.map((diagnostic) => diagnostic.code),
    ).toContain('raw.command.moveCall.argumentTypes');
    const unsupportedSparseCommand = rawTransactionToIR({
      inputs: [],
      commands: [sparse],
    }).commands[0];
    expect(unsupportedSparseCommand.kind).toBe('Unsupported');
    if (unsupportedSparseCommand.kind === 'Unsupported') {
      const clonedSparse = unsupportedSparseCommand.value as unknown[];
      expect(clonedSparse).not.toBe(sparse);
      expect(clonedSparse.length).toBe(1);
      expect(0 in clonedSparse).toBe(false);
    }

    expect(
      validatePTBGraph({ nodes: sparse, edges: [] }).map(
        (diagnostic) => diagnostic.code,
      ),
    ).toContain('graph.nodes');
    expect(
      validatePTBGraph({ nodes: [], edges: sparse }).map(
        (diagnostic) => diagnostic.code,
      ),
    ).toContain('graph.edges');
    expect(
      validatePTBGraph({
        nodes: [
          {
            id: 'var-0',
            kind: 'Variable',
            name: 'value',
            varType: { kind: 'unknown' },
            ports: sparse,
          },
        ],
        edges: [],
      }).map((diagnostic) => diagnostic.code),
    ).toContain('graph.node.ports');
    expect(
      validatePTBType({ kind: 'tuple', elems: sparse }).map(
        (diagnostic) => diagnostic.code,
      ),
    ).toContain('graph.type.tuple');
    expect(
      graphToTransactionIR({
        nodes: [
          {
            id: 'cmd-0',
            kind: 'Command',
            command: 'publish',
            params: { runtime: { modules: ['AQID'], dependencies: sparse } },
            ports: [],
          },
        ],
        edges: [],
      }).diagnostics.map((diagnostic) => diagnostic.code),
    ).toContain('graph.command.params.runtime.dependencies');
  });

  it('freezes diagnostics through createTransactionIR but not direct literals', () => {
    const ir = createTransactionIR(
      [],
      [],
      [
        {
          code: 'host.diagnostic',
          message: 'Host-built diagnostic.',
        },
      ],
    );
    const literal = {
      version: 'transaction_ir_1',
      inputs: [],
      commands: [],
      diagnostics: [
        {
          code: 'host.diagnostic',
          message: 'Host-built diagnostic.',
        },
      ],
    } satisfies TransactionIR;

    expect(Object.isFrozen(ir.diagnostics)).toBe(true);
    expect(Object.isFrozen(ir.diagnostics[0])).toBe(true);
    expect(Object.isFrozen(literal.diagnostics)).toBe(false);
    expect(Object.isFrozen(literal.diagnostics[0])).toBe(false);
  });

  it('distinguishes structural IR validation from unsupported projection diagnostics', () => {
    const unsupportedIR: TransactionIR = {
      version: 'transaction_ir_1',
      inputs: [
        {
          id: 'input_0',
          kind: 'Unsupported',
          sourceKind: 'FutureInput',
        },
      ],
      commands: [
        {
          id: 'command_0',
          kind: 'Unsupported',
          sourceKind: 'FutureCommand',
          resultCount: 0,
        },
      ],
      diagnostics: [],
    };

    expect(
      validateTransactionIR(unsupportedIR).map((diagnostic) => diagnostic.code),
    ).toEqual(['ir.input.unsupported', 'ir.command.unsupported']);
    expect(
      validateTransactionIR(unsupportedIR, {
        includeExistingDiagnostics: false,
        includeUnsupportedDiagnostics: false,
      }),
    ).toEqual([]);

    const structural = parseStructuralTransactionIR(unsupportedIR);
    expect(isStructuralTransactionIR(structural)).toBe(true);
    expect(structural).not.toBe(unsupportedIR);
    expect(structural.diagnostics.map((diagnostic) => diagnostic.code)).toEqual(
      ['ir.input.unsupported', 'ir.command.unsupported'],
    );
    expect(() => transactionIRToGraph(structural)).not.toThrow();
    expect(
      validateTsSdkRenderableIR(structural).map(({ code }) => code),
    ).toEqual(['codegen.input.unsupported', 'codegen.command.unsupported']);
    expect(
      validateRawConvertibleIR(structural).map(({ code }) => code),
    ).toEqual(['raw.ir.unsupportedInput', 'raw.ir.unsupportedCommand']);
    expect(() => assertTsSdkRenderableIR(structural)).toThrow(PTBModelError);
    expect(() => assertRawConvertibleIR(structural)).toThrow(PTBModelError);
  });

  it('brands only structurally checked IR and falls back after JSON round-trips', () => {
    const literal: TransactionIR = {
      version: 'transaction_ir_1',
      inputs: [{ id: 'input_0', kind: 'Pure', bytes: 'AQID' }],
      commands: [],
      diagnostics: [],
    };
    const parsed = parseStructuralTransactionIR(literal);

    expect(isStructuralTransactionIR(literal)).toBe(false);
    expect(isStructuralTransactionIR(createTransactionIR([], []))).toBe(false);
    expect(isStructuralTransactionIR(parsed)).toBe(true);
    expect(Object.isFrozen(parsed)).toBe(true);
    expect(Object.isFrozen(parsed.inputs)).toBe(true);
    expect(Object.isFrozen(parsed.inputs[0])).toBe(true);
    expect(parsed).not.toBe(literal);

    literal.inputs[0] = { id: 'input_1', kind: 'Pure', bytes: 'BAUG' };
    expect(parsed.inputs[0]).toEqual({
      id: 'input_0',
      kind: 'Pure',
      bytes: 'AQID',
    });
    expect(() => {
      (parsed.inputs as IRInput[]).push({
        id: 'input_1',
        kind: 'Pure',
        bytes: 'BAUG',
      });
    }).toThrow();

    const roundTrip = JSON.parse(JSON.stringify(parsed)) as TransactionIR;
    expect(isStructuralTransactionIR(roundTrip)).toBe(false);
    expect(validateTsSdkRenderableIR(roundTrip)).toEqual([]);
    expect(() => transactionIRToTsSdkCode(roundTrip)).not.toThrow();
  });

  it('auto-brands structurally safe conversion results including source diagnostics', () => {
    const rawIR = rawTransactionToIR({
      inputs: [{ kind: 'Pure', bytes: 'AQID' }],
      commands: [],
    });
    const graphIR = graphToTransactionIR({ nodes: [], edges: [] });
    const sourceDiagnosticIR = rawTransactionToIR({
      inputs: [{ kind: 'Pure', bytes: 'A' }],
      commands: [],
    });
    const graphSourceDiagnosticIR = graphToTransactionIR({
      nodes: [
        {
          id: 'bad-raw',
          kind: 'Variable',
          varType: { kind: 'scalar', name: 'string' },
          name: 'badRaw',
          rawInput: { kind: 'Pure', bytes: 'A' },
          ports: [{ id: 'out', direction: 'out', role: 'io' }],
        },
      ],
      edges: [],
    });
    const malformedIR = createTransactionIR(
      [{ id: 'input_0', kind: 'Pure', bytes: 'A' }],
      [],
    );

    expect(isStructuralTransactionIR(rawIR)).toBe(true);
    expect(isStructuralTransactionIR(graphIR)).toBe(true);
    expect(isStructuralTransactionIR(sourceDiagnosticIR)).toBe(true);
    expect(sourceDiagnosticIR.diagnostics.map(({ code }) => code)).toEqual([
      'raw.base64Bytes',
      'ir.input.unsupported',
    ]);
    expect(isStructuralTransactionIR(graphSourceDiagnosticIR)).toBe(true);
    expect(
      graphSourceDiagnosticIR.diagnostics.map(({ code }) => code),
    ).toContain('graph.rawInput.pure');
    expect(isStructuralTransactionIR(malformedIR)).toBe(false);
  });

  it('shares frozen canonicalRaw subtrees for model-created raw IR', () => {
    const ir = rawTransactionToIR(sampleRawTransaction());
    expect(isStructuralTransactionIR(ir)).toBe(true);

    const objectInput = ir.inputs[1];
    if (
      objectInput.kind !== 'Object' ||
      objectInput.canonicalRaw?.kind !== 'Object'
    ) {
      throw new Error('Expected object input with canonical raw origin');
    }
    expect(objectInput.object).toBe(objectInput.canonicalRaw.object);
    expect(Object.isFrozen(objectInput.object)).toBe(true);
    expect(Object.isFrozen(objectInput.canonicalRaw)).toBe(true);

    const withdrawalInput = ir.inputs[2];
    if (
      withdrawalInput.kind !== 'FundsWithdrawal' ||
      withdrawalInput.canonicalRaw?.kind !== 'FundsWithdrawal'
    ) {
      throw new Error(
        'Expected FundsWithdrawal input with canonical raw origin',
      );
    }
    expect(withdrawalInput.value).toBe(withdrawalInput.canonicalRaw.value);
    expect(Object.isFrozen(withdrawalInput.value)).toBe(true);

    const split = ir.commands[0];
    if (
      split.kind !== 'SplitCoins' ||
      split.canonicalRaw?.kind !== 'SplitCoins'
    ) {
      throw new Error('Expected SplitCoins command with canonical raw origin');
    }
    expect(split.coin).toBe(split.canonicalRaw.coin);
    expect(split.amounts).toBe(split.canonicalRaw.amounts);
    expect(Object.isFrozen(split.amounts)).toBe(true);

    const moveCall = ir.commands[3];
    if (
      moveCall.kind !== 'MoveCall' ||
      moveCall.canonicalRaw?.kind !== 'MoveCall'
    ) {
      throw new Error('Expected MoveCall command with canonical raw origin');
    }
    expect(moveCall.typeArguments).toBe(
      moveCall.canonicalRaw.call.typeArguments,
    );
    expect(moveCall.arguments).toBe(moveCall.canonicalRaw.call.arguments);
    expect(Object.isFrozen(moveCall.arguments)).toBe(true);

    const publish = ir.commands[5];
    if (
      publish.kind !== 'Publish' ||
      publish.canonicalRaw?.kind !== 'Publish'
    ) {
      throw new Error('Expected Publish command with canonical raw origin');
    }
    expect(publish.modules).toBe(publish.canonicalRaw.modules);
    expect(publish.dependencies).toBe(publish.canonicalRaw.dependencies);
    expect(Object.isFrozen(publish.modules)).toBe(true);

    const upgrade = ir.commands[6];
    if (
      upgrade.kind !== 'Upgrade' ||
      upgrade.canonicalRaw?.kind !== 'Upgrade'
    ) {
      throw new Error('Expected Upgrade command with canonical raw origin');
    }
    expect(upgrade.ticket).toBe(upgrade.canonicalRaw.ticket);
    expect(Object.isFrozen(upgrade.ticket)).toBe(true);
  });

  it('shares frozen canonicalRaw subtrees for graph rawInput conversion', () => {
    const graphIR = graphToTransactionIR({
      nodes: [
        {
          id: 'object-raw',
          kind: 'Variable',
          varType: { kind: 'object' },
          name: 'objectRaw',
          rawInput: {
            kind: 'Object',
            object: {
              kind: 'ImmOrOwnedObject',
              objectId: normalizedObjectId('7'),
              version: '7',
              digest: TEST_DIGEST_1,
            },
          },
          ports: [{ id: 'out', direction: 'out', role: 'io' }],
        },
      ],
      edges: [],
    });

    expect(isStructuralTransactionIR(graphIR)).toBe(true);
    const input = graphIR.inputs[0];
    if (input.kind !== 'Object' || input.canonicalRaw?.kind !== 'Object') {
      throw new Error('Expected graph rawInput object conversion');
    }
    expect(input.object).toBe(input.canonicalRaw.object);
    expect(Object.isFrozen(input.object)).toBe(true);
  });

  it('rejects canonicalRaw mismatch before structural branding', () => {
    const ir = rawTransactionToIR({
      inputs: [
        {
          kind: 'Object',
          object: {
            kind: 'ImmOrOwnedObject',
            objectId: normalizedObjectId('5'),
            version: '7',
            digest: TEST_DIGEST_1,
          },
        },
      ],
      commands: [],
    });
    const tampered = JSON.parse(JSON.stringify(ir)) as TransactionIR;
    const input = tampered.inputs[0];
    if (input.kind !== 'Object' || !input.object) {
      throw new Error('Expected object input');
    }
    input.object.objectId = normalizedObjectId('6');

    expect(() => parseStructuralTransactionIR(tampered)).toThrow(PTBModelError);
    expect(
      validateTransactionIR(tampered, {
        includeExistingDiagnostics: false,
        includeUnsupportedDiagnostics: false,
      }).map((diagnostic) => diagnostic.code),
    ).toContain('ir.input.canonicalRaw');
  });
});

function sampleRawTransaction(
  options: { fundsWithdrawalFrom?: 'Sender' | 'Sponsor' } = {},
): RawProgrammableTransaction {
  const fundsWithdrawalFrom = options.fundsWithdrawalFrom ?? 'Sponsor';

  return {
    inputs: [
      { kind: 'Pure', bytes: 'AQID' },
      {
        kind: 'Object',
        object: {
          kind: 'ImmOrOwnedObject',
          objectId: normalizedObjectId('5'),
          version: '7',
          digest: TEST_DIGEST_1,
        },
      },
      {
        kind: 'FundsWithdrawal',
        value: {
          reservation: { kind: 'MaxAmountU64', amount: '1000' },
          typeArg: { kind: 'Balance', type: TEST_SUI_TYPE },
          withdrawFrom: { kind: fundsWithdrawalFrom },
        },
      },
    ],
    commands: [
      {
        kind: 'SplitCoins',
        coin: { kind: 'GasCoin' },
        amounts: [{ kind: 'Input', index: 0 }],
      },
      {
        kind: 'MergeCoins',
        destination: { kind: 'Input', index: 1 },
        sources: [{ kind: 'NestedResult', commandIndex: 0, resultIndex: 0 }],
      },
      {
        kind: 'TransferObjects',
        objects: [{ kind: 'Input', index: 1 }],
        address: { kind: 'Input', index: 0 },
      },
      {
        kind: 'MoveCall',
        call: {
          package: normalizedObjectId('2'),
          module: 'coin',
          function: 'value',
          typeArguments: [TEST_SUI_TYPE],
          arguments: [{ kind: 'Input', index: 1 }],
        },
      },
      {
        kind: 'MakeMoveVec',
        type: TEST_COIN_SUI_TYPE,
        elements: [{ kind: 'Input', index: 1 }],
      },
      {
        kind: 'Publish',
        modules: ['AAEC'],
        dependencies: [normalizedObjectId('1')],
      },
      {
        kind: 'Upgrade',
        modules: ['AAEC'],
        dependencies: [normalizedObjectId('1')],
        package: normalizedObjectId('9'),
        ticket: { kind: 'Input', index: 1 },
      },
    ],
  };
}

function graphEdgesHaveDeclaredHandles(graph: PTBGraph): boolean {
  const nodes = new Map(graph.nodes.map((node) => [node.id, node]));

  return graph.edges.every((edge) => {
    const source = nodes.get(edge.source);
    const target = nodes.get(edge.target);
    return (
      !!source?.ports.some((port) => port.id === edge.sourceHandle) &&
      !!target?.ports.some((port) => port.id === edge.targetHandle)
    );
  });
}

function expectValidTypeScriptSource(source: string): void {
  const fileName = `${ts.sys.getCurrentDirectory()}/packages/ptb-model/generated-ptb.ts`;
  const compilerOptions: ts.CompilerOptions = {
    module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
    target: ts.ScriptTarget.ES2022,
    strict: true,
    skipLibCheck: true,
    noEmit: true,
  };
  const host = ts.createCompilerHost(compilerOptions);
  const readFile = host.readFile.bind(host);
  const fileExists = host.fileExists.bind(host);
  const getSourceFile = host.getSourceFile.bind(host);

  host.readFile = (name) => (name === fileName ? source : readFile(name));
  host.fileExists = (name) => name === fileName || fileExists(name);
  host.getSourceFile = (
    name,
    languageVersion,
    onError,
    shouldCreateNewSourceFile,
  ) =>
    name === fileName
      ? ts.createSourceFile(name, source, languageVersion, true)
      : getSourceFile(
          name,
          languageVersion,
          onError,
          shouldCreateNewSourceFile,
        );

  const program = ts.createProgram([fileName], compilerOptions, host);
  const diagnostics = ts
    .getPreEmitDiagnostics(program)
    .filter(
      (diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error,
    );

  expect(
    diagnostics.map((diagnostic) =>
      ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
    ),
  ).toEqual([]);
}

function expectModelErrorCodes(action: () => unknown, codes: string[]): void {
  try {
    action();
  } catch (error) {
    expect(error).toBeInstanceOf(PTBModelError);
    const diagnostics = (error as PTBModelError).diagnostics;
    codes.forEach((code) => {
      expect(diagnostics.map((diagnostic) => diagnostic.code)).toContain(code);
    });
    return;
  }

  throw new Error('Expected PTBModelError.');
}
