// src/ui/edges/utils.ts
// React Flow handle utilities
// This module ONLY parses handle strings of the form "portId[:serializedType]".
// All type/category logic is centralized in domain/typecheck.ts.

/** Extract the raw handle string (may include ":type"). */
export function rawHandle(v?: string | null | undefined): string | undefined {
  // eslint-disable-next-line no-restricted-syntax
  return v !== null && v !== undefined ? String(v) : undefined;
}

/** Get the port id (left side before ':'). */
export function portOf(handle?: string | null): string {
  const raw = rawHandle(handle) ?? '';
  return raw.split(':')[0];
}

/** Get the serialized type (right side after ':') if present. */
export function typeOf(handle?: string | null): string | undefined {
  const raw = rawHandle(handle);
  if (!raw) return undefined;
  const idx = raw.indexOf(':');
  return idx >= 0 ? raw.slice(idx + 1) : undefined;
}
