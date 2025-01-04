import React, { useCallback, useEffect, useRef, useState } from 'react';

import { Transaction } from '@mysten/sui/transactions';
import {
  addEdge,
  Background,
  BackgroundVariant,
  Connection,
  Controls,
  MiniMap,
  ReactFlow,
  useEdgesState,
  useNodesState,
  useReactFlow,
  XYPosition,
} from '@xyflow/react';

import { PTBEdges } from './edges';
import { PTBEdge, PTBNode, PTBNodes, PTBNodeType } from './nodes';
import {
  Code,
  ContextMenu,
  ContextProp,
  CreateNode,
  Panel,
  PTB,
} from '../components';
import { autoLayoutFlow } from '../components/autoLayoutFlow';
import {
  enqueueToast,
  NETWORK,
  useStateContext,
  useStateUpdateContext,
} from '../provider';
import {
  decodeTxb,
  getPath,
  PTB_SCHEME,
  PTB_SCHEME_VERSION,
  useDebounce,
} from '../utilities';
import { InputStyle } from './nodes/styles';

export const PTBFlow = ({
  disableNetwork,
  themeSwitch,
  minZoom,
  maxZoom,
  restore,
  update,
  excuteTx,
}: {
  disableNetwork: boolean;
  themeSwitch?: boolean;
  minZoom: number;
  maxZoom: number;
  restore?: string | PTB_SCHEME;
  update: (ptb: PTB_SCHEME) => void;
  excuteTx?: (transaction: Transaction | undefined) => Promise<void>;
}) => {
  // eslint-disable-next-line no-restricted-syntax
  const ref = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line no-restricted-syntax
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  // eslint-disable-next-line no-restricted-syntax
  const [rfInstance, setRfInstance] = useState<any>(null);
  const { setViewport, fitView } = useReactFlow();

  const setState = useStateUpdateContext();
  const {
    canEdit,
    network,
    exportPackageData,
    importPackageData,
    fetchPackageData,
  } = useStateContext();

  const [nodes, setNodes, onNodesChange] = useNodesState<PTBNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<PTBEdge>([]);
  const [prevRestore, setPrevRestore] = useState<string>('');
  const { debouncedFunction: debouncedUpdate, cancel } = useDebounce(
    update,
    100,
  );

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
          deletable:
            !canEdit ||
            (type !== PTBNodeType.Start && type !== PTBNodeType.End),
        },
      ]);
    },
    [canEdit, setNodes],
  );

  const handleContextMenu = useCallback(
    (event: any, item?: PTBNode | PTBEdge) => {
      event.preventDefault();
      if (ref.current && canEdit) {
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
    [canEdit],
  );

  const onConnect = useCallback(
    (params: Connection) => {
      if (canEdit && params.source !== params.target) {
        if (params.sourceHandle!.split(':')[1] === 'command') {
          setEdges((eds) => {
            const flowEdges = eds.filter(
              (edge) =>
                !(
                  (edge.source === params.source ||
                    edge.target === params.target) &&
                  edge.type === 'Command'
                ),
            );
            return addEdge(
              {
                ...params,
                type: 'Command',
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
    [setEdges, canEdit],
  );

  useEffect(() => {
    if (nodes.length || edges.length) {
      if (rfInstance) {
        const flow = rfInstance.toObject();
        const updateData: PTB_SCHEME = {
          version: PTB_SCHEME_VERSION,
          network,
          flow,
          modules: exportPackageData ? exportPackageData() : {},
        };
        debouncedUpdate(updateData);
      }
    }
  }, [nodes, edges, network, rfInstance, debouncedUpdate, exportPackageData]);

  useEffect(() => {
    return () => {
      cancel();
    };
  }, [cancel]);

  useEffect(() => {
    setState((oldData) => ({
      ...oldData,
      hasPath: getPath(nodes, edges).length > 0,
    }));
  }, [edges, nodes, setState]);

  useEffect(() => {
    const init = async () => {
      try {
        if (typeof restore === 'string') {
          if (restore !== '' && prevRestore !== restore && fetchPackageData) {
            setPrevRestore(restore);
            const decodedData = await decodeTxb(
              network,
              restore,
              fetchPackageData,
            );
            const { nodes: layoutedNodes, edges: layoutedEdges } =
              await autoLayoutFlow(
                [...(decodedData.nodes || [])],
                [...(decodedData.edges || [])],
              );
            setNodes(layoutedNodes);
            setTimeout(() => {
              setEdges(layoutedEdges);
              fitView();
            }, 100);
            setTimeout(() => {
              fitView();
            }, 1);
          }
        } else if (typeof restore === 'object') {
          const { version, flow } = restore;
          importPackageData && importPackageData(restore.modules || {});
          if (flow) {
            if (version !== '2') {
              enqueueToast('Invalid version', { variant: 'error' });
            } else {
              setNodes([...(flow.nodes || [])]);
              setViewport(flow.viewport);
              setState((oldState) => ({
                ...oldState,
                network: (restore.network as NETWORK) || network,
              }));
              setTimeout(() => {
                setEdges([...(flow.edges || [])]);
              }, 100);
            }
          } else {
            const temp = JSON.stringify(restore);
            if (temp !== prevRestore) {
              setPrevRestore(JSON.stringify(restore));
              setNodes([]);
              setEdges([]);
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
          }
        }
      } catch (error) {
        enqueueToast(`${error}`, { variant: 'error' });
      }
    };
    init();
  }, [
    createNode,
    fitView,
    importPackageData,
    prevRestore,
    restore,
    setState,
    setEdges,
    setNodes,
    setViewport,
    network,
    fetchPackageData,
  ]);

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
        onInit={setRfInstance}
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
        {restore !== undefined && (
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
                <option value="mainnet">Mainnet</option>
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
            {canEdit && restore !== undefined && (
              <Code nodes={nodes} edges={edges} excuteTx={excuteTx} />
            )}
          </Panel>
        )}
        {restore !== undefined && menu && (
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
