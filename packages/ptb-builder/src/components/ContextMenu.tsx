import React, { useCallback } from 'react';

import { useReactFlow, useViewport, XYPosition } from '@xyflow/react';

import { Menu, MenuItem } from './Menu.data';
import { enqueueToast } from '../provider';
import { PTBEdge, PTBNode, PTBNodeType } from '../_PTBFlow/nodes';
import { MenuStyle, MenuSubStyle } from '../_PTBFlow/nodes/styles';
import { getLayoutedElements } from '../utilities/getLayoutedElements';

export interface ContextProp {
  selected?: PTBNode | PTBEdge;
  top?: number;
  left?: number;
  right?: number;
  bottom?: number;
}

export type CreateNode = (
  id: string,
  position: XYPosition,
  label: string,
  type: PTBNodeType,
) => void;

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
  createNode: CreateNode;
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
    (event: any, item: MenuItem) => {
      const { clientX, clientY } = event;
      const position = {
        x: (clientX - x) / zoom,
        y: (clientY - y) / zoom,
      };
      createNode(
        `${item.type}-${Date.now()}`,
        position,
        item.name,
        item.type as PTBNodeType,
      );
      onClick();
    },
    [createNode, onClick, x, y, zoom],
  );

  const handleNodeClick = useCallback(
    (event: any, item: MenuItem) => {
      if (item.type === 'DeleteNode') {
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
    (event: any, item: MenuItem) => {
      if (item.type === 'DeleteEdge') {
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
              onClick={(e) => handleCreateClick(e, item)}
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
              onClick={(e) => handleNodeClick(e, item)}
            >
              {item.name}
            </li>
          );
        } else if (selected && !('position' in selected)) {
          return (
            <li
              key={key}
              className={MenuStyle}
              onClick={(e) => handleEdgeClick(e, item)}
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
            {Menu.inputs.map((item, key) => (
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
            {Menu.utilities.map((item, key) => (
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
            {renderMenuItems(Menu.transactions)}
          </>
        )}
        {selected && (
          <>
            {selected && 'position' in selected && (
              <>{renderMenuItems(Menu.node)}</>
            )}
            {selected && !('position' in selected) && (
              <>{renderMenuItems(Menu.edge)}</>
            )}
          </>
        )}
      </ul>
    </div>
  );
};
