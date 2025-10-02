import { PTBTemplate_exchange_all_for_sui } from './PTBTemplate_exchange_all_for_sui';
import { PTBTemplate_exchange_all_for_wal } from './PTBTemplate_exchange_all_for_wal';
import { PTBTemplate_merge } from './PTBTemplate_merge';
import { PTBTemplate_split } from './PTBTemplate_split';

type TemplateButton = { key: string; label: string; tooltip?: string };

export const TEMPLATE_MAP = {
  split: PTBTemplate_split,
  merge: PTBTemplate_merge,
  exchange_all_for_sui: PTBTemplate_exchange_all_for_sui,
  exchange_all_for_wal: PTBTemplate_exchange_all_for_wal,
} as const;

export const PRIMARY_BUTTON: TemplateButton = {
  key: 'new',
  label: 'New File',
  tooltip: 'Empty document',
};
export const SECONDARY_BUTTONS: TemplateButton[] = [
  { key: 'split', label: 'Split Object', tooltip: 'SplitCoins pipeline' },
  { key: 'merge', label: 'Merge Object', tooltip: 'MergeCoins pipeline' },
  {
    key: 'exchange_all_for_sui',
    label: 'WAL → SUI',
    tooltip: 'Testnet only',
  },
  {
    key: 'exchange_all_for_wal',
    label: 'SUI → WAL',
    tooltip: 'Testnet only',
  },
];
