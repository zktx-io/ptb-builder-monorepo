import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const sourceRoot = fileURLToPath(new URL('../src', import.meta.url));
const sourceFiles = collectSourceFiles(sourceRoot);

const forbiddenImports = [
  {
    label: 'legacy dapp-kit package',
    matches: ({ specifier }: ImportRecord) => specifier === '@mysten/dapp-kit',
  },
  {
    label: 'JSON-RPC imports',
    matches: ({ specifier }: ImportRecord) =>
      specifier === '@mysten/sui/jsonRpc' ||
      specifier.startsWith('@mysten/sui/jsonRpc/'),
  },
  {
    label: 'SuiClient class import or re-export',
    matches: ({ specifier, statement }: ImportRecord) =>
      specifier === '@mysten/sui/client' &&
      /\b(SuiClient|SuiJsonRpcClient|getJsonRpcFullnodeUrl|getFullnodeUrl)\b/.test(
        statement,
      ),
  },
  {
    label: 'Sui client namespace import or dynamic import',
    matches: ({ specifier, statement }: ImportRecord) =>
      specifier === '@mysten/sui/client' &&
      (/\bimport\s+\*\s+as\b/.test(statement) ||
        /\bimport\s*\(/.test(statement)),
  },
  {
    label: 'Sui client barrel re-export',
    matches: ({ specifier, statement }: ImportRecord) =>
      specifier === '@mysten/sui/client' &&
      /\bexport\s+(?:type\s+)?\*/.test(statement),
  },
  {
    label: 'ptb-model subpath import',
    matches: ({ specifier }: ImportRecord) =>
      specifier.startsWith('@zktx.io/ptb-model/') ||
      /(?:^|[./])ptb-model\/(?:src|dist)\//.test(specifier),
  },
];

describe('builder source guardrails', () => {
  it('keeps source imports on the model root and SDK Core boundary', () => {
    const violations = sourceFiles.flatMap((file) => {
      const text = readFileSync(file, 'utf8');
      return importViolations(text).map((label) => `${file}: ${label}`);
    });

    expect(violations).toEqual([]);
  });

  it('checks import and export specifiers without flagging comments or strings', () => {
    expect(
      importViolations(`
        const message = 'Do not import ptb-model/src or getFullnodeUrl here';
        // A migration note may mention @mysten/sui/jsonRpc without importing it.
      `),
    ).toEqual([]);
    expect(
      importViolations(`
        import type {
          /* SuiClient was replaced by the Core-compatible client type. */
          ClientWithCoreApi,
        } from '@mysten/sui/client';
      `),
    ).toEqual([]);
  });

  it('still rejects forbidden import and export forms', () => {
    expect(
      importViolations(
        "import { SuiClient as Foo } from '@mysten/sui/client';",
      ),
    ).toContain('SuiClient class import or re-export');
    expect(
      importViolations("const sui = await import('@mysten/sui/client');"),
    ).toContain('Sui client namespace import or dynamic import');
    expect(importViolations("export * from '@mysten/sui/client';")).toContain(
      'Sui client barrel re-export',
    );
    expect(
      importViolations(
        "import { rawTransactionToIR } from '@zktx.io/ptb-model/raw';",
      ),
    ).toContain('ptb-model subpath import');
  });
});

type ImportRecord = {
  statement: string;
  specifier: string;
};

function importViolations(text: string): string[] {
  return collectImportRecords(text).flatMap((record) =>
    forbiddenImports
      .filter(({ matches }) => matches(record))
      .map(({ label }) => label),
  );
}

function collectImportRecords(text: string): ImportRecord[] {
  const records: ImportRecord[] = [];
  const patterns = [
    /\bimport\s+(?:type\s+)?(?:[^'";]*?\s+from\s+)?['"]([^'"]+)['"]/g,
    /\bexport\s+(?:type\s+)?(?:\*|\{[^}]*\})\s+from\s+['"]([^'"]+)['"]/g,
    /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  ];

  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      records.push({
        statement: stripImportComments(match[0]),
        specifier: match[1],
      });
    }
  }

  return records;
}

function stripImportComments(value: string): string {
  return value.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n\r]*/g, '');
}

function collectSourceFiles(root: string): string[] {
  return readdirSync(root).flatMap((entry) => {
    const path = join(root, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) return collectSourceFiles(path);
    return /\.(ts|tsx)$/.test(path) ? [path] : [];
  });
}
