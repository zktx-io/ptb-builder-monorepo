import { graphDiagnostic } from './graph/diagnostics.js';
import type { GraphDiagnosticCode } from './graph/diagnostics.js';
import { errorDiagnostic, freezeDiagnostics } from './ir/diagnostics.js';
import type { TransactionDiagnostic } from './ir/diagnostics.js';
import { isKnownNonObjectStructTypeTag } from './move/structTypeTags.js';
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
  codeFamily: 'ptb' | 'graph';
  label: string;
}

const DEFAULT_TYPE_CONTEXT: PTBTypeDiagnosticContext = {
  codeFamily: 'ptb',
  label: 'PTB type',
};

const GRAPH_TYPE_CONTEXT: PTBTypeDiagnosticContext = {
  codeFamily: 'graph',
  label: 'PTB graph type',
};

const TYPE_DIAGNOSTIC_CODES = {
  base: { ptb: 'ptb.type', graph: 'graph.type' },
  depth: { ptb: 'ptb.type.depth', graph: 'graph.type.depth' },
  cycle: { ptb: 'ptb.type.cycle', graph: 'graph.type.cycle' },
  kind: { ptb: 'ptb.type.kind', graph: 'graph.type.kind' },
  scalar: { ptb: 'ptb.type.scalar', graph: 'graph.type.scalar' },
  numeric: { ptb: 'ptb.type.numeric', graph: 'graph.type.numeric' },
  tuple: { ptb: 'ptb.type.tuple', graph: 'graph.type.tuple' },
  object: { ptb: 'ptb.type.object', graph: 'graph.type.object' },
  unknown: { ptb: 'ptb.type.unknown', graph: 'graph.type.unknown' },
  unknownField: {
    ptb: 'ptb.type.unknownField',
    graph: 'graph.type.unknownField',
  },
} as const satisfies Record<
  string,
  { readonly ptb: string; readonly graph: GraphDiagnosticCode }
>;
type PTBTypeDiagnosticKey = keyof typeof TYPE_DIAGNOSTIC_CODES;
type PTBTypeDiagnosticSuffix = Exclude<PTBTypeDiagnosticKey, 'base'>;

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

/**
 * Canonicalizes a Move struct tag that can be used as a PTB object type hint.
 * This is a shape-only candidate check: it rejects primitives, vectors, and
 * model-known non-object families, but it does not prove Sui `key` ability,
 * package existence, or live object availability.
 */
export function parsePTBObjectTypeTagCandidate(
  value: unknown,
): string | undefined {
  const typeTag = parseMoveStructTypeTag(value);
  if (typeTag === undefined) return undefined;
  return isKnownNonObjectStructTypeTag(typeTag) ? undefined : typeTag;
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
      typeDiagnostic(
        context,
        'depth',
        `${context.label} nesting must not exceed ${MAX_PTB_TYPE_DEPTH}.`,
        path,
      ),
    );
    return;
  }

  if (!isPlainObject(value) || typeof value.kind !== 'string') {
    diagnostics.push(
      typeDiagnostic(
        context,
        undefined,
        `${context.label} must be an object with a kind.`,
        path,
      ),
    );
    return;
  }

  if (seen.has(value)) {
    diagnostics.push(
      typeDiagnostic(
        context,
        'cycle',
        `${context.label} must not contain cyclic references.`,
        path,
      ),
    );
    return;
  }
  seen.add(value);

  if (!isOneOf(value.kind, PTB_TYPE_KINDS)) {
    diagnostics.push(
      typeDiagnostic(
        context,
        'kind',
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
          typeDiagnostic(
            context,
            'scalar',
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
          typeDiagnostic(
            context,
            'numeric',
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
          typeDiagnostic(
            context,
            'tuple',
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
          parsePTBObjectTypeTagCandidate(value.typeTag) === undefined)
      ) {
        diagnostics.push(
          typeDiagnostic(
            context,
            'object',
            `Object ${context.label} typeTag must be a PTB object type-tag candidate when present; primitives, vectors, and known non-object structs are not object candidates.`,
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
          typeDiagnostic(
            context,
            'unknown',
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
        typeDiagnostic(
          context,
          'unknownField',
          `${context.label} does not support field ${key}.`,
          `${path}.${key}`,
        ),
      );
    });
}

function typeDiagnostic(
  context: PTBTypeDiagnosticContext,
  suffix: PTBTypeDiagnosticSuffix | undefined,
  message: string,
  path: string,
): TransactionDiagnostic {
  const key = suffix ?? 'base';
  if (context.codeFamily === 'graph') {
    return graphDiagnostic(TYPE_DIAGNOSTIC_CODES[key].graph, message, path);
  }

  return errorDiagnostic(
    TYPE_DIAGNOSTIC_CODES[key].ptb,
    'shape',
    message,
    path,
  );
}

function isOneOf<const T extends readonly string[]>(
  value: unknown,
  values: T,
): value is T[number] {
  return typeof value === 'string' && values.includes(value);
}
