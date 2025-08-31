// src/ui/edges/edgeUtils.ts
// React Flow handle utilities
// This module ONLY parses handle strings of the form "portId[:serializedType]".
// All type/category logic is centralized in domain/typecheck.ts.

/** Normalize handle string (undefined safe). */
function rawHandle(v?: string): string | undefined {
  return v !== undefined ? String(v) : undefined;
}

/** Extract the serialized type (after ':') if present. */
export function typeOf(handle?: string): string | undefined {
  const raw = rawHandle(handle)?.trim();
  if (!raw) return undefined;
  const idx = raw.indexOf(':');
  return idx >= 0 ? raw.slice(idx + 1) : undefined;
}

/** Extract the port id (before ':'). */
export function portIdOf(handle?: string): string | undefined {
  const raw = rawHandle(handle);
  if (!raw) return undefined;
  const idx = raw.indexOf(':');
  return idx >= 0 ? raw.slice(0, idx) : raw;
}
