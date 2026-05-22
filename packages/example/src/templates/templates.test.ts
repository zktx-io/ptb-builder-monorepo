import { describe, expect, it } from 'vitest';

import { TEMPLATE_MAP } from './index';

const LEGACY_HANDLE_IDS = new Set(['out_coin_0', 'out_ret_0', 'in_dest']);

function collectStrings(value: unknown, out: string[] = []): string[] {
  if (typeof value === 'string') {
    out.push(value);
    return out;
  }
  if (Array.isArray(value)) {
    value.forEach((item) => collectStrings(item, out));
    return out;
  }
  if (value && typeof value === 'object') {
    Object.values(value).forEach((item) => collectStrings(item, out));
  }
  return out;
}

function hasParamsUi(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  if (Array.isArray(value)) return value.some(hasParamsUi);
  const record = value as Record<string, unknown>;
  if (
    record.params &&
    typeof record.params === 'object' &&
    !Array.isArray(record.params) &&
    'ui' in record.params
  ) {
    return true;
  }
  return Object.values(record).some(hasParamsUi);
}

describe('PTB templates', () => {
  it('do not emit legacy builder-only graph handles', () => {
    Object.values(TEMPLATE_MAP).forEach((template) => {
      const doc = JSON.parse(template.file()) as unknown;
      const strings = collectStrings(doc);

      LEGACY_HANDLE_IDS.forEach((handle) => {
        expect(
          strings,
          `${template.id} should not contain ${handle}`,
        ).not.toContain(handle);
      });
    });
  });

  it('do not emit builder-only command UI params', () => {
    Object.values(TEMPLATE_MAP).forEach((template) => {
      const doc = JSON.parse(template.file()) as unknown;

      expect(
        hasParamsUi(doc),
        `${template.id} should not contain params.ui`,
      ).toBe(false);
    });
  });
});
