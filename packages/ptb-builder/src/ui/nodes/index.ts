import { EndNode } from './EndNode';
import { CmdNode } from './sample/CmdNode';
import { VarNode } from './sample/VarNode';
import { StartNode } from './StartNode';

export const NodeTypes = {
  'ptb-end': EndNode,
  'ptb-start': StartNode,
  'ptb-var': VarNode,
  'ptb-cmd': CmdNode,
};
