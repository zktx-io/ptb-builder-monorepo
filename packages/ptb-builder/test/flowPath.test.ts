import type { Edge as RFEdge, Node as RFNode } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import {
  createsFlowLoop,
  hasStartToEnd,
  isFlowEdge,
} from '../src/ui/utils/flowPath';

function node(id: string, type = 'ptb-command'): RFNode {
  return { id, type, position: { x: 0, y: 0 }, data: {} };
}

function edge(
  id: string,
  source: string,
  target: string,
  type: string,
): RFEdge {
  return { id, source, target, type };
}

describe('flowPath', () => {
  it('identifies flow edges through the shared RF/model projection rules', () => {
    expect(isFlowEdge(edge('e1', 'a', 'b', 'ptb-flow'))).toBe(true);
    expect(
      isFlowEdge({
        ...edge('e2', 'a', 'b', 'ptb-io'),
        data: { ptbEdge: { kind: 'flow' } },
      }),
    ).toBe(false);
    expect(isFlowEdge(edge('flow:a:b', 'a', 'b', 'ptb-io'))).toBe(false);
    expect(isFlowEdge(edge('io:a:b', 'a', 'b', 'ptb-io'))).toBe(false);
    expect(
      isFlowEdge({
        ...edge('flow:a:b', 'a', 'b', ''),
        data: { ptbEdge: { kind: 'flow' } },
      }),
    ).toBe(true);
  });

  it('checks Start-to-End reachability through flow edges only', () => {
    const nodes = [
      node('start', 'ptb-start'),
      node('cmd'),
      node('end', 'ptb-end'),
    ];

    expect(
      hasStartToEnd(nodes, [
        edge('f1', 'start', 'cmd', 'ptb-flow'),
        edge('f2', 'cmd', 'end', 'ptb-flow'),
      ]),
    ).toBe(true);

    expect(
      hasStartToEnd(nodes, [
        edge('f1', 'start', 'cmd', 'ptb-flow'),
        edge('io1', 'cmd', 'end', 'ptb-io'),
      ]),
    ).toBe(false);
  });

  it('does not reject flow connections because of IO-only reachability', () => {
    const edges = [
      edge('f1', 'start', 'cmd1', 'ptb-flow'),
      edge('f2', 'cmd1', 'cmd2', 'ptb-flow'),
      edge('io1', 'cmd2', 'var1', 'ptb-io'),
      edge('io2', 'var1', 'cmd3', 'ptb-io'),
    ];

    expect(createsFlowLoop(edges, 'cmd3', 'cmd1')).toBe(false);
  });

  it('rejects real flow cycles', () => {
    const edges = [
      edge('f1', 'cmd1', 'cmd2', 'ptb-flow'),
      edge('f2', 'cmd2', 'cmd3', 'ptb-flow'),
    ];

    expect(createsFlowLoop(edges, 'cmd3', 'cmd1')).toBe(true);
  });
});
