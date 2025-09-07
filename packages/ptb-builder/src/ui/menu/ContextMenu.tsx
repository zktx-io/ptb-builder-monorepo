// Context menu (canvas/node/edge) aligned to tx.pure mental model.
// Structure:
//   - Auto layout
//   - Commands (flat)
//   - Scalars (flat: address/number/bool/string/id/object)
//   - Vector (submenu: u8..u256, bool, string, address, id, object)
//   - Resources (submenu: wallet/gas/clock/random/system)
//
// Singleton gating remains for resources (wallet/gas/clock/random/system).

import React, { useCallback, useEffect, useMemo, useRef } from 'react';

import { useViewport } from '@xyflow/react';

import { handleMenuAction } from './menu.actions';
import {
  CanvasCmd,
  CanvasOption,
  CanvasResources,
  CanvasScalarQuick,
  CanvasVector,
  EdgeMenu,
  NodeMenu,
} from './menu.data';
import type { PTBNode } from '../../ptb/graph/types';
import { KNOWN_IDS } from '../../ptb/seedGraph';
import { usePtb } from '../PtbProvider';

type ContextType = 'canvas' | 'node' | 'edge';

const MenuStyle =
  'cursor-pointer px-2 bg-white dark:bg-stone-900 hover:bg-gray-200 dark:hover:bg-stone-700 w-full text-gray-800 dark:text-gray-200 relative';
const MenuSubStyle =
  'absolute left-full top-0 mt-0 ml-0 hidden group-hover:block bg-white dark:bg-stone-900 rounded-md shadow-lg z-50 w-[240px] whitespace-normal break-words';
const DisabledStyle =
  'opacity-40 pointer-events-none cursor-not-allowed hover:bg-transparent dark:hover:bg-transparent';

export interface ContextMenuProps {
  type: ContextType;
  position: { top: number; left: number };
  targetId?: string;
  onClose: () => void;
  onAddNode?: (node: PTBNode) => void;
  onDeleteNode?: (id: string) => void;
  onDeleteEdge?: (id: string) => void;
  onAutoLayout?: () => void;
}

export const ContextMenu: React.FC<ContextMenuProps> = ({
  type,
  position,
  targetId,
  onClose,
  onAddNode,
  onDeleteNode,
  onDeleteEdge,
  onAutoLayout,
}) => {
  const { x, y, zoom } = useViewport();
  const { isWellKnownAvailable } = usePtb();
  // eslint-disable-next-line no-restricted-syntax
  const rootRef = useRef<HTMLDivElement | null>(null);

  /** Resource singleton-disable map (wallet/gas/clock/random/system). */
  const actionToWellKnown: Record<string, keyof typeof KNOWN_IDS> = useMemo(
    () => ({
      'var/resource/wallet': 'MY_WALLET',
      'var/resource/gas': 'GAS',
      'var/resource/clock': 'CLOCK',
      'var/resource/random': 'RANDOM',
      'var/resource/system': 'SYSTEM',
    }),
    [],
  );

  const disabledActions = useMemo(() => {
    const set = new Set<string>();
    for (const [action, wkKey] of Object.entries(actionToWellKnown)) {
      const wkId = KNOWN_IDS[wkKey];
      if (!isWellKnownAvailable(wkId)) set.add(action);
    }
    return set;
  }, [actionToWellKnown, isWellKnownAvailable]);

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

  const runAction = useCallback(
    (action: string) => {
      if (disabledActions.has(action)) return;
      return handleMenuAction(
        action,
        placeAndAdd,
        targetId,
        onDeleteNode,
        onDeleteEdge,
        onClose,
      );
    },
    [
      disabledActions,
      placeAndAdd,
      targetId,
      onDeleteNode,
      onDeleteEdge,
      onClose,
    ],
  );

  // Close on Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Close on outside click (capture)
  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      const el = rootRef.current;
      if (!el) return;
      const path = (e as any).composedPath?.() ?? [];
      const inside = path.some((n: any) => n === el);
      if (!inside) onClose();
    };
    window.addEventListener('pointerdown', onPointerDown, { capture: true });
    return () =>
      window.removeEventListener(
        'pointerdown',
        onPointerDown as any,
        {
          capture: true,
        } as any,
      );
  }, [onClose]);

  // Prevent clipping off-screen
  const { safeTop, safeLeft } = useMemo(() => {
    const MARGIN = 8;
    const MENU_W = 260;
    const MENU_H = 420;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const left = Math.min(
      Math.max(MARGIN, position.left),
      vw - MENU_W - MARGIN,
    );
    const top = Math.min(Math.max(MARGIN, position.top), vh - MENU_H - MARGIN);
    return { safeTop: top, safeLeft: left };
  }, [position.left, position.top]);

  // ---- Render helpers ----
  const renderCmds = () => (
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
          <div className="flex items-center gap-1">
            {item.icon && <span className="inline-block">{item.icon}</span>}
            {item.name}
          </div>
        </li>
      ))}
    </>
  );

  const renderScalars = () => (
    <>
      {CanvasScalarQuick.map((item) => (
        <li
          key={item.action}
          className={MenuStyle}
          onClick={() => runAction(item.action)}
          role="menuitem"
          tabIndex={0}
          onKeyDown={(e) => e.key === 'Enter' && runAction(item.action)}
        >
          <div className="flex items-center gap-1">
            {item.icon && <span className="inline-block">{item.icon}</span>}
            {item.name}
          </div>
        </li>
      ))}
    </>
  );

  const renderVector = () => (
    <li className="relative group" role="none">
      <div
        className={`${MenuStyle} flex justify-between items-center`}
        role="menuitem"
        aria-haspopup="true"
        aria-expanded="false"
        tabIndex={0}
      >
        {CanvasVector.label}
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
        {CanvasVector.items.map((item) => (
          <li
            key={item.action}
            className={MenuStyle}
            onClick={() => runAction(item.action)}
            role="menuitem"
            tabIndex={0}
            onKeyDown={(e) => e.key === 'Enter' && runAction(item.action)}
          >
            <div className="flex items-center gap-1">
              {item.icon && <span className="inline-block">{item.icon}</span>}
              {item.name}
            </div>
          </li>
        ))}
      </ul>
    </li>
  );

  const renderOption = () => (
    <li className="relative group" role="none">
      <div
        className={`${MenuStyle} flex justify-between items-center`}
        role="menuitem"
        aria-haspopup="true"
        aria-expanded="false"
        tabIndex={0}
      >
        {CanvasOption.label}
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
        {CanvasOption.items.map((item) => (
          <li
            key={item.action}
            className={MenuStyle}
            onClick={() => runAction(item.action)}
            role="menuitem"
            tabIndex={0}
            onKeyDown={(e) => e.key === 'Enter' && runAction(item.action)}
          >
            <div className="flex items-center gap-1">
              {item.icon && <span className="inline-block">{item.icon}</span>}
              {item.name}
            </div>
          </li>
        ))}
      </ul>
    </li>
  );

  const renderResources = () => (
    <li className="relative group" role="none">
      <div
        className={`${MenuStyle} flex justify-between items-center`}
        role="menuitem"
        aria-haspopup="true"
        aria-expanded="false"
        tabIndex={0}
      >
        {CanvasResources.label}
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
        {CanvasResources.items.map((item) => {
          const isDisabled = disabledActions.has(item.action);
          return (
            <li
              key={item.action}
              className={`${MenuStyle} ${isDisabled ? DisabledStyle : ''}`}
              onClick={() => !isDisabled && runAction(item.action)}
              role="menuitem"
              tabIndex={0}
              aria-disabled={isDisabled}
              onKeyDown={(e) =>
                !isDisabled && e.key === 'Enter' && runAction(item.action)
              }
              title={
                isDisabled
                  ? 'This singleton already exists in the graph.'
                  : undefined
              }
            >
              <div className="flex items-center gap-1">
                {item.icon && <span className="inline-block">{item.icon}</span>}
                {item.name}
              </div>
            </li>
          );
        })}
      </ul>
    </li>
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
        minWidth: 240,
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
            {/* Auto layout */}
            <li
              className={MenuStyle}
              onClick={() => {
                onAutoLayout?.();
                onClose();
              }}
              role="menuitem"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  onAutoLayout?.();
                  onClose();
                }
              }}
              title="Arrange nodes automatically"
            >
              Auto layout
            </li>

            <li className="my-1 border-t border-gray-300 dark:border-stone-700" />

            {/* Commands (flat) */}
            {renderCmds()}

            <li className="my-1 border-t border-gray-300 dark:border-stone-700" />

            {/* Scalars (flat) */}
            {renderScalars()}

            {/* Vector & Resources (submenus) */}
            {renderVector()}
            {renderOption()}
            {renderResources()}
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
