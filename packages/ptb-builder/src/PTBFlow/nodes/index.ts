import { End } from './etc/End';
import { Start } from './etc/Start';
import Inputs from './inputs';
import { MergeCoins } from './transactions/MergeCoins';
import { MoveCall } from './transactions/MoveCall';
import { Publish } from './transactions/Publish';
import { SplitCoins } from './transactions/SplitCoins';
import { TransferObjects } from './transactions/TransferObjects';
export type { NodeProp } from './types';

export const PTBNodes = {
  End,
  Start,
  MergeCoins,
  MoveCall,
  Publish,
  SplitCoins,
  TransferObjects,
  ...Inputs,
};
