import React, { useCallback } from 'react';

import {
  Edge,
  Node,
  useReactFlow,
  useViewport,
  XYPosition,
} from '@xyflow/react';

import { MENU, MENU_EDGE, MENU_NODE, MenuItem, MenuList } from './Menu.data';
import { enqueueToast } from '../Provider/toastManager';
import { MenuStyle, MenuSubStyle } from '../PTBFlow/nodes/styles';
import { getLayoutedElements } from '../utilities/getLayoutedElements';

export interface ContextProp {
  selected?: Node | Edge;
  top?: number;
  left?: number;
  right?: number;
  bottom?: number;
}

export const ContextMenu = ({
  selected,
  top,
  left,
  right,
  bottom,
  onClick,
  createNode,
}: ContextProp & {
  onClick: () => void;
  createNode: (
    id: string,
    position: XYPosition,
    label: string,
    type: MENU,
  ) => void;
}) => {
  const { fitView, getEdges, getNodes, setNodes, setEdges } = useReactFlow();
  const { x, y, zoom } = useViewport();

  const handleAutoLayout = useCallback(async () => {
    try {
      const { nodes: layoutedNodes, edges: layoutedEdges } =
        await getLayoutedElements(getNodes(), getEdges());
      setNodes([...layoutedNodes]);
      setEdges([...layoutedEdges]);
      setTimeout(() => {
        fitView();
      }, 1);
    } catch (error) {
      enqueueToast(`${error}`, {
        variant: 'error',
      });
    }
    onClick();
  }, [fitView, getEdges, getNodes, onClick, setEdges, setNodes]);

  const handleCreateClick = useCallback(
    (event: any, item: { name: string; type: MENU }) => {
      const { clientX, clientY } = event;
      const position = {
        x: (clientX - x) / zoom,
        y: (clientY - y) / zoom,
      };
      createNode(`${item.type}-${Date.now()}`, position, item.name, item.type);
      onClick();
    },
    [createNode, onClick, x, y, zoom],
  );

  const handleNodeClick = useCallback(
    (event: any, item: { name: string; type: MENU_NODE }) => {
      if (item.type === MENU_NODE.Delete) {
        selected &&
          setNodes((nds) =>
            nds.filter(
              (node) =>
                node.id !== selected.id ||
                node.id === '@start' ||
                node.id === '@end',
            ),
          );
      }
      onClick();
    },
    [onClick, selected, setNodes],
  );

  const handleEdgeClick = useCallback(
    (event: any, item: { name: string; type: MENU_EDGE }) => {
      if (item.type === MENU_EDGE.Delete) {
        selected &&
          setEdges((edgs) => edgs.filter((edge) => edge.id !== selected.id));
      }
      onClick();
    },
    [onClick, selected, setEdges],
  );

  const renderMenuItems = useCallback(
    (menuItems: MenuItem[]) => {
      return menuItems.map((item, key) => {
        if (!selected) {
          return (
            <li
              key={key}
              className={MenuStyle}
              onClick={(e) => handleCreateClick(e, item as any)}
            >
              {item.icon && <span className="mr-1">{item.icon}</span>}
              {item.name}
            </li>
          );
        } else if (selected && 'position' in selected) {
          return (
            <li
              key={key}
              className={MenuStyle}
              onClick={(e) => handleNodeClick(e, item as any)}
            >
              {item.name}
            </li>
          );
        } else if (selected && !('position' in selected)) {
          return (
            <li
              key={key}
              className={MenuStyle}
              onClick={(e) => handleEdgeClick(e, item as any)}
            >
              {item.name}
            </li>
          );
        }

        return undefined;
      });
    },
    [handleCreateClick, handleEdgeClick, handleNodeClick, selected],
  );

  return (
    <div
      className="absolute rounded-md border-1 shadow-2xl bg-white dark:bg-stone-900"
      style={{ top, left, right, bottom, zIndex: 10000 }}
    >
      <ul className="flex flex-col py-1 text-left text-sm text-gray-700 dark:text-gray-500">
        {!selected && (
          <>
            <li className={MenuStyle} onClick={handleAutoLayout}>
              Auto Layout
            </li>
            <div className="border-t border-gray-300 dark:border-stone-700 my-1" />
            {MenuList.inputs.map((item, key) => (
              <li key={`0-${key}`} className="relative group">
                <div
                  className={`${MenuStyle} flex justify-between items-center`}
                >
                  {item.name}
                  <svg
                    className="w-4 h-4 ml-2"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M9 5l7 7-7 7"
                    />
                  </svg>
                </div>
                <ul className={MenuSubStyle}>
                  {renderMenuItems(item.submenu)}
                </ul>
              </li>
            ))}
            <div className="border-t border-gray-300 dark:border-stone-700 my-1" />
            {renderMenuItems(MenuList.transactions)}
          </>
        )}
        {selected && (
          <>
            {selected && 'position' in selected && (
              <>{renderMenuItems(MenuList.node)}</>
            )}
            {selected && !('position' in selected) && (
              <>{renderMenuItems(MenuList.edge)}</>
            )}
          </>
        )}
      </ul>
    </div>
  );
};
