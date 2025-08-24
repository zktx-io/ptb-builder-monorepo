import type { CommandKind, PTBNode } from '../../ptb/graph/types';
import { NodeFactories } from '../nodes/nodeFactories';

/**
 * Route context-menu actions to node factories.
 * - Commands: "cmd/<CommandKind>" (camelCase, canonical)
 * - Variables: "var/<category>/<single|multi|special>"
 */
export function handleMenuAction(
  action: string,
  placeAndAdd: (node: PTBNode) => void,
  targetId?: string,
  onDeleteNode?: (id: string) => void,
  onDeleteEdge?: (id: string) => void,
  onClose?: () => void,
) {
  if (!action) {
    onClose?.();
    return;
  }

  // Commands
  if (action.startsWith('cmd/')) {
    const kind = action.slice(4) as CommandKind;
    placeAndAdd(NodeFactories.command(kind));
    onClose?.();
    return;
  }

  // Variables
  if (action.startsWith('var/')) {
    const [, cat, name] = action.split('/');

    switch (cat) {
      case 'address':
        if (name === 'single')
          return void (placeAndAdd(NodeFactories.address()), onClose?.());
        if (name === 'multi')
          return void (placeAndAdd(NodeFactories.addressVector()), onClose?.());
        if (name === 'wallet')
          return void (placeAndAdd(NodeFactories.addressWallet()), onClose?.());
        break;

      case 'bool':
        if (name === 'single')
          return void (placeAndAdd(NodeFactories.bool()), onClose?.());
        if (name === 'multi')
          return void (placeAndAdd(NodeFactories.boolVector()), onClose?.());
        break;

      case 'number':
        if (name === 'single')
          return void (placeAndAdd(NodeFactories.number()), onClose?.());
        if (name === 'multi')
          return void (placeAndAdd(NodeFactories.numberVector()), onClose?.());
        break;

      case 'string':
        if (name === 'single')
          return void (placeAndAdd(NodeFactories.string()), onClose?.());
        if (name === 'multi')
          return void (placeAndAdd(NodeFactories.stringVector()), onClose?.());
        if (name === '0x2suiSui')
          return void (placeAndAdd(NodeFactories.string0x2suiSui()),
          onClose?.());
        break;

      case 'object':
        if (name === 'single')
          return void (placeAndAdd(NodeFactories.object()), onClose?.());
        if (name === 'multi')
          return void (placeAndAdd(NodeFactories.objectVector()), onClose?.());
        break;

      case 'helper':
        if (name === 'gas')
          return void (placeAndAdd(NodeFactories.objectGas()), onClose?.());
        if (name === 'clock')
          return void (placeAndAdd(NodeFactories.objectClock()), onClose?.());
        if (name === 'coinWithBalance')
          return void (placeAndAdd(NodeFactories.objectCoinWithBalance()),
          onClose?.());
        if (name === 'denyList')
          return void (placeAndAdd(NodeFactories.objectDenyList()),
          onClose?.());
        if (name === 'option')
          return void (placeAndAdd(NodeFactories.objectOption()), onClose?.());
        if (name === 'random')
          return void (placeAndAdd(NodeFactories.objectRandom()), onClose?.());
        if (name === 'system')
          return void (placeAndAdd(NodeFactories.objectSystem()), onClose?.());
        break;
    }

    onClose?.();
    return;
  }

  // Delete actions
  if (action === 'delete_node' && targetId) {
    onDeleteNode?.(targetId);
    onClose?.();
    return;
  }
  if (action === 'delete_edge' && targetId) {
    onDeleteEdge?.(targetId);
    onClose?.();
    return;
  }

  onClose?.();
}
