import { analyzePTBGraph, graphDocumentDiagnostics } from '../graph/types.js';
import type { PTBGraph } from '../graph/types.js';
import {
  freezeDiagnostics,
  hasErrors,
  errorDiagnostic as modelDiagnostic,
  PTBModelError,
} from '../ir/diagnostics.js';
import type {
  DiagnosticCategory,
  TransactionDiagnostic,
} from '../ir/diagnostics.js';
import { parseObjectId } from '../raw/types.js';
import {
  cloneJsonLike,
  isDenseArray,
  isFiniteNumber,
  isRecord,
  NULL_VALUE,
} from '../utils.js';

function docDiagnostic(
  code: string,
  category: DiagnosticCategory,
  message: string,
  path?: string,
): TransactionDiagnostic {
  return modelDiagnostic(code, category, message, path);
}

export const PTB_DOC_VERSION_V4 = 'ptb_4' as const;
export type PTBDocVersion = typeof PTB_DOC_VERSION_V4;

export interface PTBDocV4 {
  version: typeof PTB_DOC_VERSION_V4;
  graph: PTBGraph;
  chain?: string;
  sender?: string;
  modules?: Record<string, unknown>;
  objects?: Record<string, unknown>;
  view?: { x: number; y: number; zoom: number };
}

const PTB_DOC_V4_FIELDS = [
  'version',
  'graph',
  'chain',
  'sender',
  'modules',
  'objects',
  'view',
] as const;
const PTB_DOC_VIEW_FIELDS = ['x', 'y', 'zoom'] as const;

export function detectPTBDocVersion(value: unknown): PTBDocVersion | undefined {
  if (!isRecord(value)) return undefined;
  return value.version === PTB_DOC_VERSION_V4 ? value.version : undefined;
}

export function validatePTBDocV4(
  value: unknown,
): readonly TransactionDiagnostic[] {
  const diagnostics: TransactionDiagnostic[] = [];

  if (!isRecord(value)) {
    diagnostics.push(
      docDiagnostic(
        'doc.invalid',
        'shape',
        'PTB document must be an object.',
        '$',
      ),
    );
    return freezeDiagnostics(diagnostics);
  }

  validateDocumentJsonLike(value, '$', diagnostics);

  if (value.version !== PTB_DOC_VERSION_V4) {
    diagnostics.push(
      docDiagnostic(
        'doc.version',
        'shape',
        'PTB document version must be ptb_4.',
        '$.version',
      ),
    );
  }
  Object.keys(value)
    .filter((key) => !(PTB_DOC_V4_FIELDS as readonly string[]).includes(key))
    .forEach((key) => {
      diagnostics.push(
        docDiagnostic(
          'doc.unknownField',
          'shape',
          `PTB document does not support field ${key}.`,
          `$.${key}`,
        ),
      );
    });

  diagnostics.push(
    ...graphDocumentDiagnostics(
      analyzePTBGraph(value.graph, { path: '$.graph' }).diagnostics,
    ),
  );
  validateOptionalString(value.chain, '$.chain', 'chain', diagnostics);
  validateOptionalSender(value.sender, '$.sender', diagnostics);
  validateOptionalRecord(value.modules, '$.modules', 'modules', diagnostics);
  validateOptionalRecord(value.objects, '$.objects', 'objects', diagnostics);
  validateOptionalView(value.view, '$.view', diagnostics);

  return freezeDiagnostics(diagnostics);
}

export function parsePTBDocV4(value: unknown): PTBDocV4 {
  const diagnostics = validatePTBDocV4(value);
  if (hasErrors(diagnostics)) {
    throwDocError(diagnostics);
  }

  return cloneJsonLike(value) as PTBDocV4;
}

function throwDocError(diagnostics: readonly TransactionDiagnostic[]): never {
  const message = diagnostics.map((diagnostic) => diagnostic.message).join(' ');
  throw new PTBModelError(message, diagnostics);
}

function validateOptionalString(
  value: unknown,
  path: string,
  field: string,
  diagnostics: TransactionDiagnostic[],
): void {
  if (value === undefined || typeof value === 'string') return;
  diagnostics.push(
    docDiagnostic(
      `doc.${field}`,
      'shape',
      `PTB document ${field} must be a string when present.`,
      path,
    ),
  );
}

function validateOptionalSender(
  value: unknown,
  path: string,
  diagnostics: TransactionDiagnostic[],
): void {
  if (value === undefined) return;
  if (typeof value !== 'string') {
    diagnostics.push(
      docDiagnostic(
        'doc.sender',
        'shape',
        'PTB document sender must be a string when present.',
        path,
      ),
    );
    return;
  }

  const sender = parseObjectId(value);
  if (sender !== undefined && sender === value) return;
  diagnostics.push(
    docDiagnostic(
      'doc.sender',
      'reference',
      'PTB document sender must be a canonical Sui address when present.',
      path,
    ),
  );
}

function validateOptionalRecord(
  value: unknown,
  path: string,
  field: string,
  diagnostics: TransactionDiagnostic[],
): void {
  if (value === undefined || isRecord(value)) return;
  diagnostics.push(
    docDiagnostic(
      `doc.${field}`,
      'shape',
      `PTB document ${field} must be an object when present.`,
      path,
    ),
  );
}

function validateOptionalView(
  value: unknown,
  path: string,
  diagnostics: TransactionDiagnostic[],
): void {
  if (value === undefined) return;
  if (isRecord(value)) {
    validateUnknownFields(
      value,
      PTB_DOC_VIEW_FIELDS,
      'doc.view.unknownField',
      path,
      'PTB document view',
      diagnostics,
    );
    if (isView(value)) return;
  }
  diagnostics.push(
    docDiagnostic(
      'doc.view',
      'shape',
      'PTB document view must contain numeric x, y, and zoom when present.',
      path,
    ),
  );
}

function validateDocumentJsonLike(
  value: unknown,
  path: string,
  diagnostics: TransactionDiagnostic[],
): void {
  const active = new WeakSet<object>();
  const stack: Array<{ value: unknown; path: string; exit?: boolean }> = [
    { value, path },
  ];

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) continue;
    const { value: item, path: itemPath } = current;

    if (current.exit) {
      if (typeof item === 'object' && item !== NULL_VALUE) {
        active.delete(item);
      }
      continue;
    }

    if (item === NULL_VALUE) continue;
    const itemType = typeof item;
    if (
      itemType === 'string' ||
      itemType === 'boolean' ||
      (itemType === 'number' && Number.isFinite(item))
    ) {
      continue;
    }

    if (Array.isArray(item)) {
      if (!isDenseArray(item)) {
        diagnostics.push(
          docDiagnostic(
            'doc.json',
            'shape',
            'PTB document values must use dense JSON arrays.',
            itemPath,
          ),
        );
        continue;
      }
      if (active.has(item)) {
        diagnostics.push(
          docDiagnostic(
            'doc.json',
            'shape',
            'PTB document values must not contain cyclic references.',
            itemPath,
          ),
        );
        continue;
      }
      active.add(item);
      stack.push({ value: item, path: itemPath, exit: true });
      for (let index = item.length - 1; index >= 0; index -= 1) {
        stack.push({ value: item[index], path: `${itemPath}[${index}]` });
      }
      continue;
    }

    if (isPlainDocumentObject(item)) {
      if (active.has(item)) {
        diagnostics.push(
          docDiagnostic(
            'doc.json',
            'shape',
            'PTB document values must not contain cyclic references.',
            itemPath,
          ),
        );
        continue;
      }
      active.add(item);
      stack.push({ value: item, path: itemPath, exit: true });
      Object.keys(item)
        .reverse()
        .forEach((key) => {
          stack.push({
            value: item[key],
            path: `${itemPath}.${key}`,
          });
        });
      continue;
    }

    diagnostics.push(
      docDiagnostic(
        'doc.json',
        'shape',
        'PTB document values must be JSON primitives, dense arrays, or plain objects.',
        itemPath,
      ),
    );
  }
}

function isPlainDocumentObject(
  value: unknown,
): value is Record<string, unknown> {
  if (!isRecord(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === NULL_VALUE;
}

function validateUnknownFields(
  value: Record<string, unknown>,
  allowedKeys: readonly string[],
  code: string,
  path: string,
  label: string,
  diagnostics: TransactionDiagnostic[],
): void {
  Object.keys(value)
    .filter((key) => !allowedKeys.includes(key))
    .forEach((key) => {
      diagnostics.push(
        docDiagnostic(
          code,
          'shape',
          `${label} does not support field ${key}.`,
          `${path}.${key}`,
        ),
      );
    });
}

function isView(
  value: unknown,
): value is { x: number; y: number; zoom: number } {
  return (
    isRecord(value) &&
    isFiniteNumber(value.x) &&
    isFiniteNumber(value.y) &&
    isFiniteNumber(value.zoom) &&
    value.zoom > 0
  );
}
