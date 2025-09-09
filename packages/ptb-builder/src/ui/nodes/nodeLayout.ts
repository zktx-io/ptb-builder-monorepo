// src/ui/nodes/nodeLayout.ts
// -----------------------------------------------------------------------------
// Node-wide layout constants & sizes
// - Single place for spacing/metrics used across node UIs
// -----------------------------------------------------------------------------

export const FLOW_TOP = 16;
export const ROW_SPACING = 24;
export const TITLE_TO_IO_GAP = 40;
export const BOTTOM_PADDING = 22;

/** Horizontal sizes per node kind (kept small and consistent). */
export const NODE_SIZES = {
  Start: { width: 180, height: 40 },
  End: { width: 180, height: 40 },
  Command: { width: 180 },
  Variable: { width: 180 },
  Helper: { width: 180 },
} as const;

/** Compute top offset for an IO row (optionally adds a constant offset). */
export const ioTopForIndex = (idx: number, offset = 0) =>
  TITLE_TO_IO_GAP + offset + idx * ROW_SPACING;
