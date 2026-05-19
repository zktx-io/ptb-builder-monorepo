import { describe, expect, it } from 'vitest';

import { autoLayoutFlow } from '../src/ui/utils/autoLayout';

const baseNode = (
  id: string,
  kind: string,
  extra: Record<string, unknown> = {},
) =>
  ({
    id,
    position: { x: 0, y: 0 },
    data: {
      ptbNode: {
        id,
        kind,
        ...extra,
      },
    },
  }) as any;

describe('autoLayoutFlow', () => {
  it('uses rendered React Flow node height when stacking variable nodes', async () => {
    const nodes = [
      baseNode('start', 'Start'),
      baseNode('var-0', 'Variable', {
        varType: { kind: 'scalar', name: 'string' },
      }),
      {
        ...baseNode('var-1', 'Variable', {
          varType: { kind: 'scalar', name: 'string' },
        }),
        measured: { width: 180, height: 240 },
      },
      baseNode('var-2', 'Variable', {
        varType: { kind: 'scalar', name: 'string' },
      }),
      baseNode('end', 'End'),
    ];

    const positions = await autoLayoutFlow(nodes, [], {});

    expect(positions['var-2']!.y - positions['var-1']!.y).toBe(264);
  });
});
