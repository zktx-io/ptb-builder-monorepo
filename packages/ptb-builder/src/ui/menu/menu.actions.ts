// menu.actions.ts
import type { PTBNode } from '../../ptb/graph/types';
import { NodeFactories } from '../nodes/nodeFactories';

/**
 * Route menu actions to node factories or delegated handlers.
 * Number variables are unified in UI; no bit-width is passed here.
 */
export function handleMenuAction(
  action: string,
  placeAndAdd: (node: PTBNode) => void,
  targetId?: string,
  onDeleteNode?: (id: string) => void,
  onDeleteEdge?: (id: string) => void,
  onClose?: () => void,
) {
  if (action.startsWith('cmd/')) {
    const kind = action.slice(4) as Parameters<typeof NodeFactories.command>[0];
    placeAndAdd(NodeFactories.command(kind));
    return;
  }

  if (action.startsWith('var/')) {
    const [, cat, name] = action.split('/');

    switch (cat) {
      case 'address': {
        if (name === 'Address') return placeAndAdd(NodeFactories.address());
        if (name === 'AddressArray')
          return placeAndAdd(NodeFactories.addressArray());
        if (name === 'AddressVector')
          return placeAndAdd(NodeFactories.addressVector());
        if (name === 'AddressWallet')
          return placeAndAdd(NodeFactories.addressWallet());
        break;
      }
      case 'bool': {
        if (name === 'Bool') return placeAndAdd(NodeFactories.bool());
        if (name === 'BoolArray') return placeAndAdd(NodeFactories.boolArray());
        if (name === 'BoolVector')
          return placeAndAdd(NodeFactories.boolVector());
        break;
      }
      case 'number': {
        // Unified number: no bit-width selection here
        if (name === 'Number') return placeAndAdd(NodeFactories.number());
        if (name === 'NumberArray')
          return placeAndAdd(NodeFactories.numberArray());
        if (name === 'NumberVector')
          return placeAndAdd(NodeFactories.numberVector());
        break;
      }
      case 'string': {
        if (name === 'String') return placeAndAdd(NodeFactories.string());
        if (name === 'StringArray')
          return placeAndAdd(NodeFactories.stringArray());
        if (name === 'StringVector')
          return placeAndAdd(NodeFactories.stringVector());
        if (name === 'String0x2suiSui')
          return placeAndAdd(NodeFactories.string0x2suiSui());
        break;
      }
      case 'object': {
        if (name === 'Object') return placeAndAdd(NodeFactories.object());
        if (name === 'ObjectArray')
          return placeAndAdd(NodeFactories.objectArray());
        if (name === 'ObjectVector')
          return placeAndAdd(NodeFactories.objectVector());
        if (name === 'ObjectGas') return placeAndAdd(NodeFactories.objectGas());
        if (name === 'ObjectClock')
          return placeAndAdd(NodeFactories.objectClock());
        if (name === 'ObjectCoinWithBalance')
          return placeAndAdd(NodeFactories.objectCoinWithBalance());
        if (name === 'ObjectDenyList')
          return placeAndAdd(NodeFactories.objectDenyList());
        if (name === 'ObjectOption')
          return placeAndAdd(NodeFactories.objectOption());
        if (name === 'ObjectRandom')
          return placeAndAdd(NodeFactories.objectRandom());
        if (name === 'ObjectSystem')
          return placeAndAdd(NodeFactories.objectSystem());
        break;
      }
    }
  }

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
