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
  makeBoolVector,
  makeStringVector,
  makeIdVector,
  makeMoveNumericVector,
  // well-known resource
  makeGasObject,
  makeAddressOption,
  makeBoolOption,
  makeStringOption,
  makeIdOption,
  makeMoveNumericOption,
} from '../../ptb/factories';
import type { CommandKind, NumericWidth, PTBNode } from '../../ptb/graph/types';

type CreateNodeId = (prefix?: string) => string;

/**
 * Routes context-menu actions to factories (functional, no class).
 * Schema aligned to tx.pure:
 * - Commands : "cmd/<CommandKind>"
 * - Scalars  : "var/scalar/<address|number|bool|string|id|object>"
 * - Vectors  : "var/vector/<u8|u16|u32|u64|u128|u256|bool|string|address|id>"
 *   NOTE: vector<object> is intentionally not offered at UI level.
 * - Options  : "var/option/<u8|u16|u32|u64|u128|u256|bool|string|address|id>"
 *   NOTE: option<object> is intentionally not offered at UI level.
 * - Resources: "var/resource/<gas>"
 */
export function handleMenuAction(
  action: string,
  placeAndAdd: (node: PTBNode) => void,
  targetId?: string,
  onDeleteNode?: (id: string) => void,
  onDeleteEdge?: (id: string) => void,
  onClose?: () => void,
  createNodeId?: CreateNodeId,
) {
  if (!action) return void onClose?.();
  const nextVarOpts = () =>
    createNodeId ? { id: createNodeId('var') } : undefined;
  const nextCommandOpts = (kind: CommandKind) =>
    createNodeId ? { id: createNodeId(`cmd-${kind}`) } : undefined;

  // ---- Commands ----
  if (action.startsWith('cmd/')) {
    const kind = action.slice(4) as CommandKind;
    placeAndAdd(makeCommandNode(kind, nextCommandOpts(kind)));
    return void onClose?.();
  }

  // ---- Scalars ----
  if (action.startsWith('var/scalar/')) {
    const k = action.slice('var/scalar/'.length);
    switch (k) {
      case 'address':
        placeAndAdd(makeAddress(nextVarOpts()));
        break;
      case 'number':
        placeAndAdd(makeNumber(nextVarOpts()));
        break;
      case 'bool':
        placeAndAdd(makeBool(nextVarOpts()));
        break;
      case 'string':
        placeAndAdd(makeString(nextVarOpts()));
        break;
      case 'id':
        placeAndAdd(makeId(nextVarOpts()));
        break;
      case 'object':
        placeAndAdd(makeObject(undefined, nextVarOpts()));
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
      placeAndAdd(makeMoveNumericVector(k as NumericWidth, nextVarOpts()));
      return void onClose?.();
    }

    // Common vector<T>
    switch (k) {
      case 'address':
        placeAndAdd(makeAddressVector(nextVarOpts()));
        break;
      case 'bool':
        placeAndAdd(makeBoolVector(nextVarOpts()));
        break;
      case 'string':
        placeAndAdd(makeStringVector(nextVarOpts()));
        break;
      case 'id':
        placeAndAdd(makeIdVector(nextVarOpts()));
        break;
      default:
        // no-op
        break;
    }
    return void onClose?.();
  }

  // ---- Options ----
  if (action.startsWith('var/option/')) {
    const k = action.slice('var/option/'.length);

    // Move numeric widths (option<width>)
    if (
      (['u8', 'u16', 'u32', 'u64', 'u128', 'u256'] as const).includes(k as any)
    ) {
      placeAndAdd(makeMoveNumericOption(k as NumericWidth, nextVarOpts()));
      return void onClose?.();
    }

    // Common option<T>
    switch (k) {
      case 'address':
        placeAndAdd(makeAddressOption(nextVarOpts()));
        break;
      case 'bool':
        placeAndAdd(makeBoolOption(nextVarOpts()));
        break;
      case 'string':
        placeAndAdd(makeStringOption(nextVarOpts()));
        break;
      case 'id':
        placeAndAdd(makeIdOption(nextVarOpts()));
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
      case 'gas':
        placeAndAdd(makeGasObject());
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
