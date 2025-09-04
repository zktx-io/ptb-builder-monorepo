import type { EdgeTypes as RfEdgeTypes } from '@xyflow/react';

import { FlowEdge } from './FlowEdge';
import { IoEdge } from './IoEdge';

export const EdgeTypes: RfEdgeTypes = {
  'ptb-flow': FlowEdge,
  'ptb-io': IoEdge,
};
