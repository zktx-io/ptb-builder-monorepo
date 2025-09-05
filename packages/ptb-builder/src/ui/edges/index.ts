import type { EdgeTypes as RfEdgeTypes } from '@xyflow/react';

import { EdgeFlow } from './EdgeFlow';
import { EdgeIo } from './EdgeIo';

export const EdgeTypes: RfEdgeTypes = {
  'ptb-flow': EdgeFlow,
  'ptb-io': EdgeIo,
};
