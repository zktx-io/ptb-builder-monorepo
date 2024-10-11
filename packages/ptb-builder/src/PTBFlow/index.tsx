import React, { useCallback, useEffect, useRef, useState } from 'react';

import { getFullnodeUrl, SuiClient } from '@mysten/sui/client';
import {
  addEdge,
  Background,
  BackgroundVariant,
  Connection,
  Controls,
  Edge,
  MiniMap,
  Node,
  Panel,
  ReactFlow,
  useEdgesState,
  useNodesState,
  XYPosition,
} from '@xyflow/react';

import { PTBEdges } from './edges';
import { PTBNodes } from './nodes';
import { Code, ContextMenu, ContextProp } from '../Components';
import { useStateContext, useStateUpdateContext } from '../Provider';
import { hasPath } from '../utils/hasPath';
import { MENU } from '../Components/Menu.data';
import { InputStyle } from './nodes/styles';
import { Parse } from '../Components/Parse';

export const PTBFlow = ({
  network,
  themeSwitch,
}: {
  network: 'mainnet' | 'testnet' | 'devnet';
  themeSwitch?: boolean;
}) => {
  // eslint-disable-next-line no-restricted-syntax
  const ref = useRef<HTMLDivElement>(null);
  const initialized = useRef<boolean>(false);

  const setState = useStateUpdateContext();
  const { isEditor } = useStateContext();

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  const [colorMode, setColorMode] = useState<'dark' | 'light'>('dark');
  const [menu, setMenu] = useState<ContextProp | undefined>(undefined);

  const onPaneClick = useCallback(() => setMenu(() => undefined), [setMenu]);

  const createNode = useCallback(
    (id: string, position: XYPosition, label: string, type: MENU) => {
      setNodes((nds) => [
        ...nds,
        {
          id,
          position,
          type,
          data: {
            label,
          },
        },
      ]);
    },
    [setNodes],
  );

  const handleContextMenu = useCallback(
    (event: any, item?: Node | Edge) => {
      event.preventDefault();
      if (ref.current && isEditor) {
        const pane = (ref.current as any).getBoundingClientRect();
        setMenu(
          item
            ? {
                selected: item,
                top:
                  event.clientY < pane.height - 200 ? event.clientY : undefined,
                left:
                  event.clientX < pane.width - 200 ? event.clientX : undefined,
                right:
                  event.clientX >= pane.width - 200
                    ? pane.width - event.clientX
                    : undefined,
                bottom:
                  event.clientY >= pane.height - 200
                    ? pane.height - event.clientY
                    : undefined,
              }
            : {
                top:
                  event.clientY < pane.height - 200 ? event.clientY : undefined,
                left:
                  event.clientX < pane.width - 200 ? event.clientX : undefined,
                right:
                  event.clientX >= pane.width - 200
                    ? pane.width - event.clientX
                    : undefined,
                bottom:
                  event.clientY >= pane.height - 200
                    ? pane.height - event.clientY
                    : undefined,
              },
        );
      }
    },
    [isEditor],
  );

  const onConnect = useCallback(
    (params: Connection) => {
      if (isEditor) {
        if (params.sourceHandle!.split(':')[1] === 'process') {
          setEdges((eds) => {
            const flowEdges = eds.filter(
              (edge) =>
                !(
                  (edge.source === params.source ||
                    edge.target === params.target) &&
                  edge.type === 'Path'
                ),
            );
            return addEdge(
              {
                ...params,
                type: 'Path',
              },
              flowEdges,
            );
          });
        } else {
          setEdges((eds) => {
            const dataEdges = eds.filter(
              (edge) =>
                !(
                  edge.target === params.target &&
                  edge.targetHandle === params.targetHandle &&
                  edge.type === 'Data'
                ),
            );
            return addEdge(
              {
                ...params,
                type: 'Data',
              },
              dataEdges,
            );
          });
        }
      }
    },
    [setEdges, isEditor],
  );

  useEffect(() => {
    setState((oldData) => ({
      ...oldData,
      client: new SuiClient({
        url: getFullnodeUrl(network),
      }),
    }));
  }, [network, setState]);

  useEffect(() => {
    setState((oldData) => ({ ...oldData, hasPath: hasPath(nodes, edges) }));
  }, [edges, nodes, setState]);

  useEffect(() => {
    if (isEditor && !initialized.current) {
      initialized.current = true;
      const clientWidth = window.innerWidth;
      const clientHeight = window.innerHeight;
      const startX = clientWidth * 0.15;
      const endX = clientWidth * 0.85;
      const centerY = clientHeight / 2 - 50;
      createNode(
        '@start',
        { x: startX - 90, y: centerY },
        'Start',
        'Start' as MENU,
      );
      createNode('@end', { x: endX - 90, y: centerY }, 'End', 'End' as MENU);
    }
  }, [createNode, isEditor]);

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        backgroundColor: '#ffffff',
      }}
    >
      <ReactFlow
        ref={ref}
        colorMode={colorMode}
        style={{ width: '100%', height: '100%' }}
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        nodeTypes={{ ...PTBNodes }}
        edgeTypes={{ ...PTBEdges }}
        onPaneClick={() => setMenu(() => undefined)}
        onPaneContextMenu={handleContextMenu}
        onNodeContextMenu={(event, node) => handleContextMenu(event, node)}
        onEdgeContextMenu={(event, edge) => handleContextMenu(event, edge)}
      >
        <Controls className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100" />
        <MiniMap />
        <Background
          variant={BackgroundVariant.Lines}
          color={colorMode === 'dark' ? '#333' : '#ccc'}
          gap={25}
          size={1}
        />
        <Panel
          position="top-right"
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-end',
            gap: '10px',
          }}
        >
          <div
            style={{
              textAlign: 'right',
              display: 'inline-block',
              fontSize: '12px',
            }}
          >
            {themeSwitch && (
              <select
                className={InputStyle}
                onChange={(e) => {
                  setColorMode(() => e.target.value as any);
                  if (e.target.value === 'dark') {
                    document.documentElement.classList.add('dark');
                  } else {
                    document.documentElement.classList.remove('dark');
                  }
                }}
              >
                <option value="dark">Dark</option>
                <option value="light">Light</option>
              </select>
            )}
          </div>
          {isEditor && <Code nodes={nodes} edges={edges} />}
          <Parse />
        </Panel>
        {menu && (
          <ContextMenu
            {...menu}
            onClick={onPaneClick}
            createNode={createNode}
          />
        )}
      </ReactFlow>
    </div>
  );
};
