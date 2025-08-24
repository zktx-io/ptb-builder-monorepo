// src/ui/edges/utils.ts
// React Flow handle utilities
// This module ONLY parses handle strings of the form "portId[:serializedType]".
// All type/category logic is centralized in domain/typecheck.ts.

/** Extract the raw handle string (may include ":type"). */
function rawHandle(v?: string | null | undefined): string | undefined {
  // eslint-disable-next-line no-restricted-syntax
  return v !== null && v !== undefined ? String(v) : undefined;
}

/** Get the serialized type (right side after ':') if present. */
export function typeOf(handle?: string | null): string | undefined {
  const raw = rawHandle(handle)?.trim();
  if (!raw) return undefined;
  const idx = raw.indexOf(':');
  return idx >= 0 ? raw.slice(idx + 1) : undefined;
}

export function portIdOf(handle?: string | null): string | undefined {
  const raw = rawHandle(handle);
  if (!raw) return undefined;
  const idx = raw.indexOf(':');
  return idx >= 0 ? raw.slice(0, idx) : raw;
}
