import BaseCommand from './cmds/BaseCommand/BaseCommand';
import MoveCallCommand from './cmds/MoveCallCommand/MoveCallCommand';
import { EndNode } from './EndNode';
import { StartNode } from './StartNode';
import { VarNode } from './vars/VarNode';

export const NodeTypes = {
  'ptb-end': EndNode,
  'ptb-start': StartNode,
  'ptb-var': VarNode,
  'ptb-cmd': BaseCommand,
  'ptb-mvc': MoveCallCommand,
};
