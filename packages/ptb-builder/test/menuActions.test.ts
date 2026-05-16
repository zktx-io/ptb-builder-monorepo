import { describe, expect, it, vi } from 'vitest';

import { handleMenuAction } from '../src/ui/menu/menu.actions';

describe('context menu node creation', () => {
  it('uses the provider-scoped id generator for command and variable nodes', () => {
    const added: any[] = [];
    const createNodeId = vi.fn((prefix = 'id') => `${prefix}-scoped`);

    handleMenuAction(
      'cmd/splitCoins',
      (node) => added.push(node),
      undefined,
      undefined,
      undefined,
      undefined,
      createNodeId,
    );
    handleMenuAction(
      'var/scalar/address',
      (node) => added.push(node),
      undefined,
      undefined,
      undefined,
      undefined,
      createNodeId,
    );

    expect(added.map((node) => node.id)).toEqual([
      'cmd-splitCoins-scoped',
      'var-scoped',
    ]);
    expect(createNodeId).toHaveBeenCalledWith('cmd-splitCoins');
    expect(createNodeId).toHaveBeenCalledWith('var');
  });
});
