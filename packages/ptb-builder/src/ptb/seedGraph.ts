import { PTBGraph } from './graph/types';
import { PORTS } from './portTemplates';

export function seedDefaultGraph(): PTBGraph {
  return {
    nodes: [
      {
        id: '@start',
        kind: 'Start',
        label: 'Start',
        position: { x: 160, y: 300 },
        ports: PORTS.start(), // [{ id:'next', direction:'out', role:'flow' }]
      },
      {
        id: '@end',
        kind: 'End',
        label: 'End',
        position: { x: 640, y: 300 },
        ports: PORTS.end(), // [{ id:'prev', direction:'in', role:'flow' }]
      },
    ],
    edges: [],
  };
}
