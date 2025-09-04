// src/ui/nodes/menu.actions.ts

import {
  // command
  makeCommandNode,
  // scalars
  // eslint-disable-next-line sort-imports
  makeAddress,
  makeNumber,
  makeBool,
  makeString,
  makeId,
  makeObject,
  // vectors
  makeAddressVector,
  makeNumberVector,
  makeBoolVector,
  makeStringVector,
  makeIdVector,
  makeObjectVector,
  makeMoveNumericVector,
  // well-known resources
  makeWalletAddress,
  makeGasObject,
  makeClockObject,
  makeRandomObject,
  makeSystemObject,
} from '../../ptb/factories';
import type { CommandKind, NumericWidth, PTBNode } from '../../ptb/graph/types';

/**
 * Routes context-menu actions to factories (functional, no class).
 * Schema aligned to tx.pure:
 * - Commands:  "cmd/<CommandKind>"
 * - Scalars:   "var/scalar/<address|number|bool|string|id|object>"
 * - Vectors:   "var/vector/<u8|u16|u32|u64|u128|u256|bool|string|address|id|object>"
 * - Resources: "var/resource/<wallet|gas|clock|random|system>"
 */
export function handleMenuAction(
  action: string,
  placeAndAdd: (node: PTBNode) => void,
  targetId?: string,
  onDeleteNode?: (id: string) => void,
  onDeleteEdge?: (id: string) => void,
  onClose?: () => void,
) {
  if (!action) return void onClose?.();

  // ---- Commands ----
  if (action.startsWith('cmd/')) {
    const kind = action.slice(4) as CommandKind;
    placeAndAdd(makeCommandNode(kind));
    return void onClose?.();
  }

  // ---- Scalars ----
  if (action.startsWith('var/scalar/')) {
    const k = action.slice('var/scalar/'.length);
    switch (k) {
      case 'address':
        placeAndAdd(makeAddress());
        break;
      case 'number':
        placeAndAdd(makeNumber());
        break;
      case 'bool':
        placeAndAdd(makeBool());
        break;
      case 'string':
        placeAndAdd(makeString());
        break;
      case 'id':
        placeAndAdd(makeId());
        break;
      case 'object':
        placeAndAdd(makeObject());
        break;
      default:
        // no-op
        break;
    }
    return void onClose?.();
  }

  // ---- Vectors ----
  if (action.startsWith('var/vector/')) {
    const k = action.slice('var/vector/'.length);

    // Move numeric widths (vector<width>)
    if (
      (['u8', 'u16', 'u32', 'u64', 'u128', 'u256'] as const).includes(k as any)
    ) {
      placeAndAdd(makeMoveNumericVector(k as NumericWidth));
      return void onClose?.();
    }

    // Common vector<T>
    switch (k) {
      case 'address':
        placeAndAdd(makeAddressVector());
        break;
      case 'number':
        placeAndAdd(makeNumberVector());
        break;
      case 'bool':
        placeAndAdd(makeBoolVector());
        break;
      case 'string':
        placeAndAdd(makeStringVector());
        break;
      case 'id':
        placeAndAdd(makeIdVector());
        break;
      case 'object':
        placeAndAdd(makeObjectVector());
        break;
      default:
        // no-op
        break;
    }
    return void onClose?.();
  }

  // ---- Resources (singletons) ----
  if (action.startsWith('var/resource/')) {
    const name = action.slice('var/resource/'.length);
    switch (name) {
      case 'wallet':
        placeAndAdd(makeWalletAddress());
        break;
      case 'gas':
        placeAndAdd(makeGasObject());
        break;
      case 'clock':
        placeAndAdd(makeClockObject());
        break;
      case 'random':
        placeAndAdd(makeRandomObject());
        break;
      case 'system':
        placeAndAdd(makeSystemObject());
        break;
      default:
        // no-op
        break;
    }
    return void onClose?.();
  }

  // ---- Deletes ----
  if (action === 'delete_node' && targetId) {
    onDeleteNode?.(targetId);
    return void onClose?.();
  }
  if (action === 'delete_edge' && targetId) {
    onDeleteEdge?.(targetId);
    return void onClose?.();
  }

  return void onClose?.();
}
