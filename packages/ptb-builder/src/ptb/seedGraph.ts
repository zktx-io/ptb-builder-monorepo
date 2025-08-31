import { PTBGraph } from './graph/types';
import { PORTS } from './portTemplates';

export const START_ID = '@start';
export const END_ID = '@end';

export function seedDefaultGraph(): PTBGraph {
  return {
    nodes: [
      {
        id: START_ID,
        kind: 'Start',
        label: 'Start',
        position: { x: 160, y: 300 },
        ports: PORTS.start(), // [{ id:'next', direction:'out', role:'flow' }]
      },
      {
        id: END_ID,
        kind: 'End',
        label: 'End',
        position: { x: 640, y: 300 },
        ports: PORTS.end(), // [{ id:'prev', direction:'in', role:'flow' }]
      },
    ],
    edges: [],
  };
}
