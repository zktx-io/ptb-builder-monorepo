import { validatePTBGraph } from '../graph/types.js';
import type { PTBGraph } from '../graph/types.js';
import {
  errorDiagnostic,
  freezeDiagnostics,
  hasErrors,
  PTBModelError,
} from '../ir/diagnostics.js';
import type { TransactionDiagnostic } from '../ir/diagnostics.js';
import { isFiniteNumber, isRecord } from '../utils.js';

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
      errorDiagnostic('doc.invalid', 'PTB document must be an object.', '$'),
    );
    return freezeDiagnostics(diagnostics);
  }

  if (value.version !== PTB_DOC_VERSION_V4) {
    diagnostics.push(
      errorDiagnostic(
        'doc.version',
        'PTB document version must be ptb_4.',
        '$.version',
      ),
    );
  }
  Object.keys(value)
    .filter((key) => !(PTB_DOC_V4_FIELDS as readonly string[]).includes(key))
    .forEach((key) => {
      diagnostics.push(
        errorDiagnostic(
          'doc.unknownField',
          `PTB document does not support field ${key}.`,
          `$.${key}`,
        ),
      );
    });

  diagnostics.push(...validatePTBGraph(value.graph, '$.graph'));
  validateOptionalString(value.chain, '$.chain', 'chain', diagnostics);
  validateOptionalString(value.sender, '$.sender', 'sender', diagnostics);
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

  return value as PTBDocV4;
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
    errorDiagnostic(
      `doc.${field}`,
      `PTB document ${field} must be a string when present.`,
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
    errorDiagnostic(
      `doc.${field}`,
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
    errorDiagnostic(
      'doc.view',
      'PTB document view must contain numeric x, y, and zoom when present.',
      path,
    ),
  );
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
        errorDiagnostic(
          code,
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
    isFiniteNumber(value.zoom)
  );
}
