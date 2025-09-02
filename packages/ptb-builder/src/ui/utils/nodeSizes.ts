export const NODE_SIZES = {
  Start: { width: 180 },
  End: { width: 180 },
  Command: { width: 180 },
  Variable: { width: 180 },
  Helper: { width: 180 },
} as const;

export function getNodeSize(kind?: string) {
  return (NODE_SIZES as any)[kind ?? ''] ?? { width: 200 };
}
