// src/editor/ContextMenu.tsx
// Context menu with hover submenus (pure UI). All mutations are delegated via callbacks.

import React, { useCallback, useEffect, useMemo, useRef } from 'react';

import { useViewport } from '@xyflow/react';

import { handleMenuAction } from './menu.actions';
import { CanvasCmd, CanvasVar, EdgeMenu, NodeMenu } from './menu.data';
import type { PTBNode } from '../../ptb/graph/types';

type ContextType = 'canvas' | 'node' | 'edge';

const MenuStyle =
  'cursor-pointer px-2 bg-white dark:bg-stone-900 hover:bg-gray-200 dark:hover:bg-stone-700 w-full text-gray-800 dark:text-gray-200 relative';
const MenuSubStyle =
  'absolute left-full top-0 mt-0 ml-0 hidden group-hover:block bg-white dark:bg-stone-900 rounded-md shadow-lg z-50 w-[220px] whitespace-normal break-words';

export interface ContextMenuProps {
  /** Which surface was right-clicked */
  type: ContextType;
  /** Screen coordinates (relative to container) where the menu should appear */
  position: { top: number; left: number };
  /** Selected nodeId/edgeId when right-clicked on node/edge */
  targetId?: string;
  /** Close the menu (parent controls visibility) */
  onClose: () => void;

  /** Delegate mutations to parent */
  onAddNode?: (node: PTBNode) => void;
  onDeleteNode?: (id: string) => void;
  onDeleteEdge?: (id: string) => void;
}

export const ContextMenu: React.FC<ContextMenuProps> = ({
  type,
  position,
  targetId,
  onClose,
  onAddNode,
  onDeleteNode,
  onDeleteEdge,
}) => {
  const { x, y, zoom } = useViewport();
  // eslint-disable-next-line no-restricted-syntax
  const rootRef = useRef<HTMLDivElement>(null);

  /** Convert screen coords → flow coords and add node via parent callback. */
  const placeAndAdd = useCallback(
    (node: PTBNode) => {
      node.position = {
        x: (position.left - x) / zoom,
        y: (position.top - y) / zoom,
      };
      onAddNode?.(node);
      onClose();
    },
    [onAddNode, onClose, position.left, position.top, x, y, zoom],
  );

  /** Thin router: delegates actions to parent handlers/factories. */
  const runAction = useCallback(
    (action: string) =>
      handleMenuAction(
        action,
        placeAndAdd,
        targetId,
        onDeleteNode,
        onDeleteEdge,
        onClose,
      ),
    [placeAndAdd, targetId, onDeleteNode, onDeleteEdge, onClose],
  );

  /** Escape key closes the menu. */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  /** Click outside closes the menu. */
  useEffect(() => {
    const onDocMouseDown = (e: MouseEvent) => {
      const el = rootRef.current;
      if (!el) return;
      if (!el.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', onDocMouseDown);
    return () => document.removeEventListener('mousedown', onDocMouseDown);
  }, [onClose]);

  /** Prevent clipping off-screen (approximate bounding). */
  const { safeTop, safeLeft } = useMemo(() => {
    const MARGIN = 8;
    const MENU_W = 240; // minWidth 220 + padding/border
    const MENU_H = 320; // rough height

    const vw = window.innerWidth;
    const vh = window.innerHeight;

    const left = Math.min(
      Math.max(MARGIN, position.left),
      vw - MENU_W - MARGIN,
    );
    const top = Math.min(Math.max(MARGIN, position.top), vh - MENU_H - MARGIN);

    return { safeTop: top, safeLeft: left };
  }, [position.left, position.top]);

  const renderCommands = () => (
    <>
      {CanvasCmd.map((item) => (
        <li
          key={item.action}
          className={MenuStyle}
          onClick={() => runAction(item.action)}
          role="menuitem"
          tabIndex={0}
          onKeyDown={(e) => e.key === 'Enter' && runAction(item.action)}
        >
          <div className="flex items-center">
            {item.icon && (
              <span className="mr-1 inline-block">{item.icon}</span>
            )}
            {item.name}
          </div>
        </li>
      ))}
    </>
  );

  const renderVars = () => (
    <>
      {CanvasVar.map((group) => (
        <li key={group.label} className="relative group" role="none">
          <div
            className={`${MenuStyle} flex justify-between items-center`}
            role="menuitem"
            aria-haspopup="true"
            aria-expanded="false"
            tabIndex={0}
          >
            {group.label}
            <svg
              className="w-4 h-4 ml-2"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M9 5l7 7-7 7"
              />
            </svg>
          </div>
          <ul className={MenuSubStyle} role="menu">
            {group.items.map((item) => (
              <li
                key={item.action}
                className={MenuStyle}
                onClick={() => runAction(item.action)}
                role="menuitem"
                tabIndex={0}
                onKeyDown={(e) => e.key === 'Enter' && runAction(item.action)}
              >
                {item.icon && (
                  <span className="mr-1 inline-block">{item.icon}</span>
                )}
                {item.name}
              </li>
            ))}
          </ul>
        </li>
      ))}
    </>
  );

  return (
    <div
      ref={rootRef}
      className="absolute rounded-md shadow-2xl bg-white dark:bg-stone-900"
      style={{
        top: safeTop,
        left: safeLeft,
        border: '1px solid rgba(0,0,0,0.08)',
        zIndex: 10000,
        minWidth: 220,
        pointerEvents: 'auto',
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        onClose();
      }}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      role="menu"
      aria-label="Context menu"
    >
      <ul className="flex flex-col py-1 text-left text-sm text-gray-700 dark:text-gray-300">
        {type === 'canvas' && (
          <>
            {renderCommands()}
            <li className="my-1 border-t border-gray-300 dark:border-stone-700" />
            {renderVars()}
          </>
        )}

        {type === 'node' &&
          NodeMenu.map((it) => (
            <li
              key={it.action}
              className={MenuStyle}
              onClick={() => runAction(it.action)}
              role="menuitem"
              tabIndex={0}
              onKeyDown={(e) => e.key === 'Enter' && runAction(it.action)}
            >
              {it.name}
            </li>
          ))}

        {type === 'edge' &&
          EdgeMenu.map((it) => (
            <li
              key={it.action}
              className={MenuStyle}
              onClick={() => runAction(it.action)}
              role="menuitem"
              tabIndex={0}
              onKeyDown={(e) => e.key === 'Enter' && runAction(it.action)}
            >
              {it.name}
            </li>
          ))}
      </ul>
    </div>
  );
};
