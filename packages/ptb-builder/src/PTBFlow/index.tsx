import React, { useCallback, useEffect, useRef, useState } from 'react';

import { getFullnodeUrl, SuiClient } from '@mysten/sui/client';
import { Transaction } from '@mysten/sui/transactions';
import {
  addEdge,
  Background,
  BackgroundVariant,
  Connection,
  Controls,
  Edge,
  MiniMap,
  ReactFlow,
  useEdgesState,
  useNodesState,
  XYPosition,
} from '@xyflow/react';

import { PTBEdges } from './edges';
import { PTBNode, PTBNodes, PTBNodeType } from './nodes';
import { Code, ContextMenu, ContextProp, CreateNode } from '../Components';
import { PTB } from '../Components/Menu.data';
import { Panel } from '../Components/Panel';
import { useStateContext, useStateUpdateContext } from '../Provider';
import { testPath } from '../utilities/testPath';
import { InputStyle } from './nodes/styles';
import { Parse } from '../Components/Parse';
import { toJson } from '../utilities/json/toJson';

export const PTBFlow = ({
  disableNetwork,
  themeSwitch,
  minZoom,
  maxZoom,
  update,
  excuteTx,
}: {
  disableNetwork: boolean;
  themeSwitch?: boolean;
  minZoom: number;
  maxZoom: number;
  update: (json: string) => void;
  excuteTx?: (transaction: Transaction | undefined) => Promise<void>;
}) => {
  // eslint-disable-next-line no-restricted-syntax
  const ref = useRef<HTMLDivElement>(null);
  const initialized = useRef<boolean>(false);
  // eslint-disable-next-line no-restricted-syntax
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  const setState = useStateUpdateContext();
  const { isEditor, network, disableUpdate } = useStateContext();

  const [nodes, setNodes, onNodesChange] = useNodesState<PTBNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [ptbJson, setPtbJson] = useState<string>('');

  const [colorMode, setColorMode] = useState<'dark' | 'light'>('dark');
  const [menu, setMenu] = useState<ContextProp | undefined>(undefined);

  const onPaneClick = useCallback(() => setMenu(() => undefined), [setMenu]);

  const createNode: CreateNode = useCallback(
    (id: string, position: XYPosition, label: string, type: PTBNodeType) => {
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
    (event: any, item?: PTBNode | Edge) => {
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
    if (nodes.length || edges.length) {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
      debounceRef.current = setTimeout(() => {
        const json = toJson({ network, nodes, edges });
        if (!disableUpdate && ptbJson !== json) {
          update(json);
        } else {
          setPtbJson(json);
          setState((oldState) => ({ ...oldState, disableUpdate: false }));
        }
        // eslint-disable-next-line no-restricted-syntax
        debounceRef.current = null;
      }, 30);
    }
  }, [disableUpdate, edges, network, nodes, ptbJson, setState, update]);

  useEffect(() => {
    setState((oldData) => ({ ...oldData, hasPath: testPath(nodes, edges) }));
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
        PTB.Start.Name,
        PTB.Start.Type,
      );
      createNode(
        '@end',
        { x: endX - 90, y: centerY },
        PTB.End.Name,
        PTB.End.Type,
      );
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
        minZoom={minZoom}
        maxZoom={maxZoom}
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
            <select
              className={InputStyle}
              style={{ pointerEvents: 'all', width: '85px' }}
              disabled={disableNetwork}
              value={network}
              onChange={(e) => {
                setState((oldData) => ({
                  ...oldData,
                  network: e.target.value as any,
                }));
              }}
            >
              <option value="testnet">Testnet</option>
              <option value="devnet">Devnet</option>
            </select>
          </div>
          {themeSwitch && (
            <div
              style={{
                textAlign: 'right',
                display: 'inline-block',
                fontSize: '12px',
              }}
            >
              <select
                className={InputStyle}
                style={{ pointerEvents: 'all', width: '85px' }}
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
            </div>
          )}
          {isEditor && <Code nodes={nodes} edges={edges} excuteTx={excuteTx} />}
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
