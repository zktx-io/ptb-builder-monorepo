// Context menu (canvas/node/edge) aligned to tx.pure mental model.
// Structure:
//   - Auto layout
//   - Commands (flat)
//   - Scalars (flat: address/number/bool/string/id/object)
//   - Vector (submenu: u8..u256, bool, string, address, id)
//     NOTE: vector<object> is intentionally not offered at UI level.
//   - Option (submenu: u8..u256, bool, string, address, id)
//     NOTE: option<object> is intentionally not offered at UI level.
//   - Resources (submenu: gas/clock/random/system)
//
// Resource submenu keeps singleton gating (gas/clock/random/system).

import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

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

// Base item/submenu styles. Visual tokens come from CSS variables via .ptb-menu*
const MenuStyle = 'cursor-pointer px-2 w-full relative ptb-menu__item';
const MenuSubStyle =
  'absolute left-full top-0 mt-0 ml-0 rounded-md shadow-lg z-50 w-[240px] whitespace-normal break-words ptb-menu__submenu';
const DisabledStyle = 'ptb-menu__item--disabled';
type SubmenuKey = 'vector' | 'option' | 'resources';

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
  const { createUniqueId, isWellKnownAvailable } = usePtb();
  const [openSubmenu, setOpenSubmenu] = useState<SubmenuKey | undefined>();
  const rootRef = useRef<HTMLDivElement | undefined>(undefined);
  const setRootEl = useCallback((el: HTMLDivElement | null) => {
    rootRef.current = el ?? undefined;
  }, []);

  /** Map menu actions to well-known singleton keys. */
  const actionToWellKnown: Record<string, keyof typeof KNOWN_IDS> = useMemo(
    () => ({
      'var/resource/gas': 'GAS',
      'var/resource/clock': 'CLOCK',
      'var/resource/random': 'RANDOM',
      'var/resource/system': 'SYSTEM',
    }),
    [],
  );

  /** Disabled action set computed from singleton availability. */
  const disabledActions = useMemo(() => {
    const set = new Set<string>();
    for (const [action, wkKey] of Object.entries(actionToWellKnown)) {
      const wkId = KNOWN_IDS[wkKey];
      if (!isWellKnownAvailable(wkId)) set.add(action);
    }
    return set;
  }, [actionToWellKnown, isWellKnownAvailable]);

  /** Place a node at the pointer (flow coords) and add to graph. */
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

  /** Run a menu action (with singleton gating for resources). */
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
        createUniqueId,
      );
    },
    [
      disabledActions,
      placeAndAdd,
      targetId,
      onDeleteNode,
      onDeleteEdge,
      onClose,
      createUniqueId,
    ],
  );

  /** Close on Escape. */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const focusMenuItem = (direction: 'first' | 'last' | 'next' | 'prev') => {
    const root = rootRef.current;
    if (!root) return;
    const items = Array.from(
      root.querySelectorAll<HTMLElement>('[role="menuitem"]'),
    ).filter((item) => {
      if (item.getAttribute('aria-disabled') === 'true') return false;
      const submenu = item.closest<HTMLElement>('[data-submenu]');
      return !submenu || submenu.dataset.submenu === openSubmenu;
    });
    if (items.length === 0) return;
    const currentIndex = items.findIndex(
      (item) => item === document.activeElement,
    );
    if (direction === 'first') {
      items[0]!.focus();
      return;
    }
    if (direction === 'last') {
      items[items.length - 1]!.focus();
      return;
    }
    const offset = direction === 'next' ? 1 : -1;
    const nextIndex =
      currentIndex < 0
        ? 0
        : (currentIndex + offset + items.length) % items.length;
    items[nextIndex]!.focus();
  };

  const focusSubmenuItem = (submenu: SubmenuKey) => {
    setOpenSubmenu(submenu);
    requestAnimationFrame(() => {
      const root = rootRef.current;
      root
        ?.querySelector<HTMLElement>(
          `[data-submenu="${submenu}"] [role="menuitem"]:not([aria-disabled="true"])`,
        )
        ?.focus();
    });
  };

  const focusSubmenuTrigger = (submenu: SubmenuKey) => {
    setOpenSubmenu(undefined);
    requestAnimationFrame(() => {
      rootRef.current
        ?.querySelector<HTMLElement>(`[data-submenu-trigger="${submenu}"]`)
        ?.focus();
    });
  };

  const onMenuKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    switch (event.key) {
      case 'ArrowRight': {
        const submenu = (event.target as HTMLElement).dataset.submenuTrigger as
          | SubmenuKey
          | undefined;
        if (!submenu) break;
        event.preventDefault();
        focusSubmenuItem(submenu);
        break;
      }
      case 'ArrowLeft': {
        const submenu = (event.target as HTMLElement).closest<HTMLElement>(
          '[data-submenu]',
        )?.dataset.submenu as SubmenuKey | undefined;
        if (!submenu) break;
        event.preventDefault();
        focusSubmenuTrigger(submenu);
        break;
      }
      case 'ArrowDown':
        event.preventDefault();
        focusMenuItem('next');
        break;
      case 'ArrowUp':
        event.preventDefault();
        focusMenuItem('prev');
        break;
      case 'Home':
        event.preventDefault();
        focusMenuItem('first');
        break;
      case 'End':
        event.preventDefault();
        focusMenuItem('last');
        break;
      case 'Enter':
      case ' ': {
        const action = (event.target as HTMLElement).dataset.action;
        if (action) {
          event.preventDefault();
          runAction(action);
          break;
        }
        if ((event.target as HTMLElement).dataset.autoLayout === 'true') {
          event.preventDefault();
          onAutoLayout?.();
          onClose();
          break;
        }
        const submenu = (event.target as HTMLElement).dataset.submenuTrigger as
          | SubmenuKey
          | undefined;
        if (!submenu) break;
        event.preventDefault();
        focusSubmenuItem(submenu);
        break;
      }
    }
  };

  /** Close on outside click (capture). */
  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      const el = rootRef.current;
      if (!el) return;
      const path = (e as any).composedPath?.() ?? [];
      const inside = path.some((n: any) => n === el);
      if (!inside) onClose();
    };
    window.addEventListener('pointerdown', onPointerDown, { capture: true });
    return () => window.removeEventListener('pointerdown', onPointerDown, true);
  }, [onClose]);

  const [pos, setPos] = useState<{ top: number; left: number }>(() => ({
    top: position.top,
    left: position.left,
  }));

  useLayoutEffect(() => {
    const el = rootRef.current;
    if (!el) return;

    // Temporarily position at the requested location to get real size.
    el.style.top = `${position.top}px`;
    el.style.left = `${position.left}px`;

    const parent =
      (el.offsetParent as HTMLElement) || el.parentElement || document.body;
    const parentRect = parent.getBoundingClientRect();
    const rect = el.getBoundingClientRect();
    const MARGIN = 8;

    // Clamp within the parent (ReactFlow container) bounds.
    const maxLeft = parentRect.width - rect.width - MARGIN;
    const maxTop = parentRect.height - rect.height - MARGIN;

    let nextLeft = Math.max(MARGIN, Math.min(position.left, maxLeft));
    let nextTop = Math.max(MARGIN, Math.min(position.top, maxTop));

    setPos({ top: nextTop, left: nextLeft });
  }, [position.top, position.left, type]);

  // ---- Render helpers ----

  const submenuClass = (key: SubmenuKey) =>
    `${MenuSubStyle} ${openSubmenu === key ? 'block' : 'hidden group-hover:block'}`;

  const renderCmds = () => (
    <>
      {CanvasCmd.map((item) => (
        <li
          key={item.action}
          className={MenuStyle}
          onClick={() => runAction(item.action)}
          role="menuitem"
          data-action={item.action}
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key !== 'Enter') return;
            e.preventDefault();
            e.stopPropagation();
            runAction(item.action);
          }}
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
          data-action={item.action}
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key !== 'Enter') return;
            e.preventDefault();
            e.stopPropagation();
            runAction(item.action);
          }}
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
    <li
      className="relative group"
      role="none"
      onMouseEnter={() => setOpenSubmenu('vector')}
      onMouseLeave={() => setOpenSubmenu(undefined)}
    >
      <div
        className={`${MenuStyle} flex justify-between items-center`}
        role="menuitem"
        aria-haspopup="true"
        aria-expanded={openSubmenu === 'vector'}
        data-submenu-trigger="vector"
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
      <ul className={submenuClass('vector')} role="menu" data-submenu="vector">
        {CanvasVector.items.map((item) => (
          <li
            key={item.action}
            className={MenuStyle}
            onClick={() => runAction(item.action)}
            role="menuitem"
            data-action={item.action}
            data-submenu-item="vector"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key !== 'Enter') return;
              e.preventDefault();
              e.stopPropagation();
              runAction(item.action);
            }}
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
    <li
      className="relative group"
      role="none"
      onMouseEnter={() => setOpenSubmenu('option')}
      onMouseLeave={() => setOpenSubmenu(undefined)}
    >
      <div
        className={`${MenuStyle} flex justify-between items-center`}
        role="menuitem"
        aria-haspopup="true"
        aria-expanded={openSubmenu === 'option'}
        data-submenu-trigger="option"
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
      <ul className={submenuClass('option')} role="menu" data-submenu="option">
        {CanvasOption.items.map((item) => (
          <li
            key={item.action}
            className={MenuStyle}
            onClick={() => runAction(item.action)}
            role="menuitem"
            data-action={item.action}
            data-submenu-item="option"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key !== 'Enter') return;
              e.preventDefault();
              e.stopPropagation();
              runAction(item.action);
            }}
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
    <li
      className="relative group"
      role="none"
      onMouseEnter={() => setOpenSubmenu('resources')}
      onMouseLeave={() => setOpenSubmenu(undefined)}
    >
      <div
        className={`${MenuStyle} flex justify-between items-center`}
        role="menuitem"
        aria-haspopup="true"
        aria-expanded={openSubmenu === 'resources'}
        data-submenu-trigger="resources"
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
      <ul
        className={submenuClass('resources')}
        role="menu"
        data-submenu="resources"
      >
        {CanvasResources.items.map((item) => {
          const isDisabled = disabledActions.has(item.action);
          return (
            <li
              key={item.action}
              className={`${MenuStyle} ${isDisabled ? DisabledStyle : ''}`}
              onClick={() => !isDisabled && runAction(item.action)}
              role="menuitem"
              data-action={isDisabled ? undefined : item.action}
              data-submenu-item="resources"
              tabIndex={0}
              aria-disabled={isDisabled}
              onKeyDown={(e) => {
                if (isDisabled || e.key !== 'Enter') return;
                e.preventDefault();
                e.stopPropagation();
                runAction(item.action);
              }}
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
      ref={setRootEl}
      className="absolute rounded-md shadow-2xl ptb-menu"
      style={{
        top: pos.top,
        left: pos.left,
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
      onKeyDown={onMenuKeyDown}
      role="menu"
      aria-label="Context menu"
    >
      <ul className="flex flex-col py-1 text-left text-sm ptb-menu__list">
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
              data-auto-layout="true"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  e.stopPropagation();
                  onAutoLayout?.();
                  onClose();
                }
              }}
              title="Arrange nodes automatically"
            >
              Auto layout
            </li>

            <li className="my-1 ptb-menu__sep" />

            {/* Commands (flat) */}
            {renderCmds()}

            <li className="my-1 ptb-menu__sep" />

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
              data-action={it.action}
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key !== 'Enter') return;
                e.preventDefault();
                e.stopPropagation();
                runAction(it.action);
              }}
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
              data-action={it.action}
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key !== 'Enter') return;
                e.preventDefault();
                e.stopPropagation();
                runAction(it.action);
              }}
            >
              {it.name}
            </li>
          ))}
      </ul>
    </div>
  );
};

export default ContextMenu;
