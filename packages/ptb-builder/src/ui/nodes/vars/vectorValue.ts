import type { PTBType } from '../../../ptb/graph/types';

export type VectorEditorItem = string | boolean;

export type VectorValueSummary = {
  count: number | undefined;
  preview: string;
  remaining: number;
  state: 'unset' | 'empty' | 'items' | 'invalid';
  title: string;
};

export type VectorDraftParseResult =
  | { ok: true; value: VectorEditorItem[] }
  | { ok: false; error: string };

const DEFAULT_PREVIEW_ITEMS = 4;
const DEFAULT_ITEM_LEFT = 14;
const DEFAULT_ITEM_RIGHT = 8;

function isBoolType(t?: PTBType): boolean {
  return t?.kind === 'scalar' && t.name === 'bool';
}

function displayText(value: unknown): string {
  return typeof value === 'undefined' ? '' : String(value);
}

export function formatVectorPreviewItem(
  value: unknown,
  left = DEFAULT_ITEM_LEFT,
  right = DEFAULT_ITEM_RIGHT,
): string {
  const text =
    typeof value === 'string'
      ? value
      : typeof value === 'boolean'
        ? String(value)
        : displayText(value);
  if (text.length <= left + right + 3) return text;
  return `${text.slice(0, left)}…${text.slice(-right)}`;
}

export function summarizeVectorValue(
  value: unknown,
  options: {
    maxItems?: number;
    itemLeft?: number;
    itemRight?: number;
  } = {},
): VectorValueSummary {
  const maxItems = options.maxItems ?? DEFAULT_PREVIEW_ITEMS;
  const itemLeft = options.itemLeft ?? DEFAULT_ITEM_LEFT;
  const itemRight = options.itemRight ?? DEFAULT_ITEM_RIGHT;

  if (typeof value === 'undefined') {
    return {
      count: undefined,
      preview: 'unset',
      remaining: 0,
      state: 'unset',
      title: 'unset',
    };
  }
  if (!Array.isArray(value)) {
    const preview = formatVectorPreviewItem(value, itemLeft, itemRight);
    return {
      count: undefined,
      preview,
      remaining: 0,
      state: 'invalid',
      title: preview,
    };
  }
  if (value.length === 0) {
    return {
      count: 0,
      preview: '[]',
      remaining: 0,
      state: 'empty',
      title: '[]',
    };
  }

  const visible = value
    .slice(0, maxItems)
    .map((item) => formatVectorPreviewItem(item, itemLeft, itemRight));
  const remaining = value.length - visible.length;
  const preview = `[${visible.join(', ')}${remaining > 0 ? ', …' : ''}]`;
  return {
    count: value.length,
    preview,
    remaining,
    state: 'items',
    title: value.map((item) => displayText(item)).join('\n'),
  };
}

export function vectorValueToDraftText(value: unknown): string {
  if (!Array.isArray(value)) return '';
  return value
    .map((item) =>
      typeof item === 'boolean' ? String(item) : displayText(item),
    )
    .join('\n');
}

export function splitVectorDraftLines(text: string): string[] {
  const withoutFinalEnter = text.endsWith('\r\n')
    ? text.slice(0, -2)
    : text.endsWith('\n') || text.endsWith('\r')
      ? text.slice(0, -1)
      : text;

  if (withoutFinalEnter === '') return [];

  const lines = withoutFinalEnter.split(/\r\n|\n|\r/);
  return lines.every((line) => line === '') ? lines.slice(1) : lines;
}

export function parseVectorDraftText(
  text: string,
  elemType?: PTBType,
): VectorDraftParseResult {
  const lines = splitVectorDraftLines(text);
  if (!isBoolType(elemType)) return { ok: true, value: lines };

  const value: boolean[] = [];
  for (let index = 0; index < lines.length; index++) {
    const normalized = lines[index].trim().toLowerCase();
    if (normalized === 'true') {
      value.push(true);
      continue;
    }
    if (normalized === 'false') {
      value.push(false);
      continue;
    }
    return {
      ok: false,
      error: `Line ${index + 1} must be true or false.`,
    };
  }
  return { ok: true, value };
}
