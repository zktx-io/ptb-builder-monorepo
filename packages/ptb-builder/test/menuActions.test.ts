import { describe, expect, it, vi } from 'vitest';

import { handleMenuAction } from '../src/ui/menu/menu.actions';
import { CanvasCmd, CanvasResources } from '../src/ui/menu/menu.data';

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

  it('exposes MakeMoveVec through the command menu and factory route', () => {
    const added: any[] = [];
    const makeMoveVec = CanvasCmd.find(
      (item) => item.action === 'cmd/makeMoveVec',
    );

    expect(makeMoveVec?.name).toBe('MakeMoveVec');

    handleMenuAction(
      'cmd/makeMoveVec',
      (node) => added.push(node),
      undefined,
      undefined,
      undefined,
      undefined,
      (prefix = 'id') => `${prefix}-scoped`,
    );

    expect(added[0]).toMatchObject({
      id: 'cmd-makeMoveVec-scoped',
      kind: 'Command',
      command: 'makeMoveVec',
    });
    expect(added[0].ports.map((port: any) => port.id)).toEqual([
      'prev',
      'next',
      'in_elem_0',
      'in_elem_1',
      'out_result',
    ]);
  });

  it('only exposes the builder-owned gas resource helper', () => {
    expect(CanvasResources.items.map((item) => item.action)).toEqual([
      'var/resource/gas',
    ]);

    const added: any[] = [];
    handleMenuAction('var/resource/gas', (node) => added.push(node));
    handleMenuAction('var/resource/clock', (node) => added.push(node));
    handleMenuAction('var/resource/random', (node) => added.push(node));
    handleMenuAction('var/resource/system', (node) => added.push(node));

    expect(added).toHaveLength(1);
    expect(added[0]).toMatchObject({
      id: '@gas',
      kind: 'Variable',
      semantic: { kind: 'GasCoin' },
    });
  });
});
