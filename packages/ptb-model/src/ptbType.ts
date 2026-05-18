import { errorDiagnostic, freezeDiagnostics } from './ir/diagnostics.js';
import type { TransactionDiagnostic } from './ir/diagnostics.js';
import { parseMoveStructTypeTag } from './raw/types.js';
import { isDenseArray, isPlainObject, MAX_PTB_TYPE_DEPTH } from './utils.js';

export const PTB_TYPE_KINDS = [
  'scalar',
  'move_numeric',
  'object',
  'vector',
  'option',
  'tuple',
  'unknown',
] as const;
export const PTB_SCALARS = [
  'bool',
  'string',
  'address',
  'id',
  'number',
] as const;
export const NUMERIC_WIDTHS = [
  'u8',
  'u16',
  'u32',
  'u64',
  'u128',
  'u256',
] as const;

export type NumericWidth = (typeof NUMERIC_WIDTHS)[number];
export type PTBScalar = (typeof PTB_SCALARS)[number];

export type PTBType =
  | { kind: 'scalar'; name: PTBScalar }
  | { kind: 'move_numeric'; width: NumericWidth }
  | { kind: 'object'; typeTag?: string }
  | { kind: 'vector'; elem: PTBType }
  | { kind: 'option'; elem: PTBType }
  | { kind: 'tuple'; elems: PTBType[] }
  | { kind: 'unknown'; debugInfo?: string };

const TYPE_KEYS_BY_KIND = {
  scalar: ['kind', 'name'],
  move_numeric: ['kind', 'width'],
  object: ['kind', 'typeTag'],
  vector: ['kind', 'elem'],
  option: ['kind', 'elem'],
  tuple: ['kind', 'elems'],
  unknown: ['kind', 'debugInfo'],
} as const satisfies Record<(typeof PTB_TYPE_KINDS)[number], readonly string[]>;

interface PTBTypeDiagnosticContext {
  codePrefix: string;
  label: string;
}

const DEFAULT_TYPE_CONTEXT: PTBTypeDiagnosticContext = {
  codePrefix: 'ptb.type',
  label: 'PTB type',
};

const GRAPH_TYPE_CONTEXT: PTBTypeDiagnosticContext = {
  codePrefix: 'graph.type',
  label: 'PTB graph type',
};

export function validatePTBType(
  value: unknown,
  path = '$',
): readonly TransactionDiagnostic[] {
  const diagnostics: TransactionDiagnostic[] = [];
  validatePTBTypeInto(value, path, diagnostics, DEFAULT_TYPE_CONTEXT);
  return freezeDiagnostics(diagnostics);
}

export function validateGraphPTBTypeInto(
  value: unknown,
  path: string,
  diagnostics: TransactionDiagnostic[],
): void {
  validatePTBTypeInto(value, path, diagnostics, GRAPH_TYPE_CONTEXT);
}

export function isPTBType(value: unknown): value is PTBType {
  return validatePTBType(value).length === 0;
}

function validatePTBTypeInto(
  value: unknown,
  path: string,
  diagnostics: TransactionDiagnostic[],
  context: PTBTypeDiagnosticContext,
): void {
  validatePTBTypeShape(
    value,
    path,
    diagnostics,
    context,
    new WeakSet<object>(),
  );
}

function validatePTBTypeShape(
  value: unknown,
  path: string,
  diagnostics: TransactionDiagnostic[],
  context: PTBTypeDiagnosticContext,
  seen: WeakSet<object>,
  depth = 0,
): void {
  if (depth > MAX_PTB_TYPE_DEPTH) {
    diagnostics.push(
      errorDiagnostic(
        `${context.codePrefix}.depth`,
        `${context.label} nesting must not exceed ${MAX_PTB_TYPE_DEPTH}.`,
        path,
      ),
    );
    return;
  }

  if (!isPlainObject(value) || typeof value.kind !== 'string') {
    diagnostics.push(
      errorDiagnostic(
        context.codePrefix,
        `${context.label} must be an object with a kind.`,
        path,
      ),
    );
    return;
  }

  if (seen.has(value)) {
    diagnostics.push(
      errorDiagnostic(
        `${context.codePrefix}.cycle`,
        `${context.label} must not contain cyclic references.`,
        path,
      ),
    );
    return;
  }
  seen.add(value);

  if (!isOneOf(value.kind, PTB_TYPE_KINDS)) {
    diagnostics.push(
      errorDiagnostic(
        `${context.codePrefix}.kind`,
        `Unsupported ${context.label} kind ${value.kind}.`,
        `${path}.kind`,
      ),
    );
    seen.delete(value);
    return;
  }

  switch (value.kind) {
    case 'scalar':
      validateTypeUnknownFields(value, path, diagnostics, context);
      if (!isOneOf(value.name, PTB_SCALARS)) {
        diagnostics.push(
          errorDiagnostic(
            `${context.codePrefix}.scalar`,
            `Scalar ${context.label} requires a supported name.`,
            `${path}.name`,
          ),
        );
      }
      seen.delete(value);
      return;
    case 'move_numeric':
      validateTypeUnknownFields(value, path, diagnostics, context);
      if (!isOneOf(value.width, NUMERIC_WIDTHS)) {
        diagnostics.push(
          errorDiagnostic(
            `${context.codePrefix}.numeric`,
            `Move numeric ${context.label} requires a supported width.`,
            `${path}.width`,
          ),
        );
      }
      seen.delete(value);
      return;
    case 'vector':
    case 'option':
      validateTypeUnknownFields(value, path, diagnostics, context);
      validatePTBTypeShape(
        value.elem,
        `${path}.elem`,
        diagnostics,
        context,
        seen,
        depth + 1,
      );
      seen.delete(value);
      return;
    case 'tuple':
      validateTypeUnknownFields(value, path, diagnostics, context);
      if (!isDenseArray(value.elems)) {
        diagnostics.push(
          errorDiagnostic(
            `${context.codePrefix}.tuple`,
            `Tuple ${context.label} requires elems array.`,
            `${path}.elems`,
          ),
        );
        seen.delete(value);
        return;
      }
      value.elems.forEach((elem, index) => {
        validatePTBTypeShape(
          elem,
          `${path}.elems[${index}]`,
          diagnostics,
          context,
          seen,
          depth + 1,
        );
      });
      seen.delete(value);
      return;
    case 'object':
      validateTypeUnknownFields(value, path, diagnostics, context);
      if (
        value.typeTag !== undefined &&
        (typeof value.typeTag !== 'string' ||
          parseMoveStructTypeTag(value.typeTag) === undefined)
      ) {
        diagnostics.push(
          errorDiagnostic(
            `${context.codePrefix}.object`,
            `Object ${context.label} typeTag must be a top-level Move struct type tag, not a primitive or vector type tag, when present.`,
            `${path}.typeTag`,
          ),
        );
      }
      seen.delete(value);
      return;
    case 'unknown':
      validateTypeUnknownFields(value, path, diagnostics, context);
      if (
        value.debugInfo !== undefined &&
        typeof value.debugInfo !== 'string'
      ) {
        diagnostics.push(
          errorDiagnostic(
            `${context.codePrefix}.unknown`,
            `Unknown ${context.label} debugInfo must be a string when present.`,
            `${path}.debugInfo`,
          ),
        );
      }
      seen.delete(value);
      return;
  }
}

function validateTypeUnknownFields(
  value: Record<string, unknown>,
  path: string,
  diagnostics: TransactionDiagnostic[],
  context: PTBTypeDiagnosticContext,
): void {
  const kind = value.kind;
  if (!isOneOf(kind, PTB_TYPE_KINDS)) return;
  const allowedKeys: readonly string[] = TYPE_KEYS_BY_KIND[kind];
  Object.keys(value)
    .filter((key) => !allowedKeys.includes(key))
    .forEach((key) => {
      diagnostics.push(
        errorDiagnostic(
          `${context.codePrefix}.unknownField`,
          `${context.label} does not support field ${key}.`,
          `${path}.${key}`,
        ),
      );
    });
}

function isOneOf<const T extends readonly string[]>(
  value: unknown,
  values: T,
): value is T[number] {
  return typeof value === 'string' && values.includes(value);
}
