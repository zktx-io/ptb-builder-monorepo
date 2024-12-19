import Commands from './commands';
import Inputs from './inputs';
export {
  PTBEdge,
  PTBNodeProp,
  PTBNode,
  PTBNodeData,
  PTBNodeType,
} from './types';

export const PTBNodes = {
  ...Commands,
  ...Inputs,
};
