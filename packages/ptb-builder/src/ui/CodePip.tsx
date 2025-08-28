// src/ui/CodePip.tsx
import React, { useEffect, useMemo, useRef, useState } from 'react';

import Prism from 'prismjs';
import { Resizable } from 're-resizable';

// Prism languages & plugins
import 'prismjs/components/prism-typescript';
import 'prismjs/components/prism-javascript';
import 'prismjs/plugins/line-numbers/prism-line-numbers';
import 'prismjs/plugins/normalize-whitespace/prism-normalize-whitespace';

// Prism CSS (theme + line numbers)
import 'prismjs/themes/prism-tomorrow.css';
import 'prismjs/plugins/line-numbers/prism-line-numbers.css';

export const EMPTY_CODE = (
  net: string,
) => `// PTB Code Preview (network: ${net})
// No commands yet.
// Connect nodes (Start → … → End) to generate ts-sdk code.
// Tip: add a MoveCall or SplitCoins node and wire inputs/outputs.

import { Transaction } from '@mysten/sui/transactions';

const tx = new Transaction();
// tx.setSenderIfNotSet('<your-address>');
// tx.setGasBudgetIfNotSet(500_000_000);

// ...the graph will generate calls here...

export { tx };
`;

type CodePipProps = {
  /** Source code to display */
  code: string;
  /** Syntax language (defaults to 'typescript') */
  language?: 'typescript' | 'javascript';
  /** Left header title (keep super short, e.g., 'Preview') */
  title?: string;
  /** Initial width (px or css size, default: 380) */
  defaultWidth?: number | string;
  /** Max height for scroll area (px or css size, default: 520) */
  maxHeight?: number | string;

  /** Theme control (header select) */
  theme: 'light' | 'dark';
  onThemeChange?: (t: 'light' | 'dark') => void;

  /** Collapsible state (checkbox controls this; checked = visible) */
  defaultCollapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;

  /** Placeholder text when code is empty */
  emptyText?: string;

  /** Optional run hook; footer button is shown only if provided */
  onExecute?: () => Promise<void> | void;
  executing?: boolean;
  canExecute?: boolean;

  /** Optional external copy handler; falls back to clipboard API */
  onCopy?: (text: string) => Promise<void> | void;
};

/** Tiny inline feedback label (no toast) */
function useInlineHint(timeoutMs = 1200) {
  const [hint, setHint] = useState<string | undefined>(undefined);
  const timer = useRef<number | undefined>();
  useEffect(
    () => () => {
      if (timer.current) window.clearTimeout(timer.current);
    },
    [],
  );
  return {
    hint,
    show: (msg: string) => {
      setHint(msg);
      if (timer.current) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setHint(undefined), timeoutMs);
    },
  };
}

export function CodePip({
  code,
  language = 'typescript',
  title = 'Preview',
  defaultWidth = 380,
  maxHeight = 520,

  theme,
  onThemeChange,

  defaultCollapsed = false,
  onCollapsedChange,

  emptyText = '// No code yet. Connect nodes or change values to see generated code.',

  onExecute,
  executing,
  canExecute = true,

  onCopy,
}: CodePipProps) {
  // eslint-disable-next-line no-restricted-syntax
  const preRef = useRef<HTMLPreElement | null>(null);
  const [collapsed, setCollapsed] = useState<boolean>(!!defaultCollapsed);
  const { hint, show } = useInlineHint();

  // Normalize code for Prism; fallback to empty placeholder
  const normalized = useMemo(() => code ?? '', [code]);
  const visibleCode = normalized.trim().length ? normalized : emptyText;

  // Prism highlight when visible and content changes
  useEffect(() => {
    if (collapsed) return;
    if (!preRef.current) return;
    try {
      Prism.highlightAllUnder(preRef.current);
    } catch {
      // never break UI on highlight errors
    }
  }, [visibleCode, language, collapsed]);

  const handleCopy = async () => {
    try {
      const text = visibleCode;
      if (onCopy) {
        await onCopy(text);
      } else if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      show('Copied');
    } catch {
      show('Copy failed');
    }
  };

  const handleCheckbox = (checked: boolean) => {
    // checked = show code; unchecked = collapsed
    setCollapsed(!checked);
    onCollapsedChange?.(!checked);
  };

  // Simple theming for header/body
  const headerBg =
    theme === 'dark' ? 'rgba(17,17,17,0.9)' : 'rgba(255,255,255,0.92)';
  const headerFg = theme === 'dark' ? '#fff' : '#111';
  const bodyBg =
    theme === 'dark' ? 'rgba(13,17,23,0.9)' : 'rgba(250,250,250,0.98)';
  const borderColor =
    theme === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)';

  return (
    <Resizable
      className="ptb-codepip"
      defaultSize={{ width: defaultWidth, height: 'auto' }}
      minWidth={280}
      maxWidth={640}
      enable={{ left: true }} // anchored to the right (nice for top-right panel)
      style={{
        pointerEvents: 'auto',
        userSelect: 'text',
        boxShadow: '0 4px 18px rgba(0,0,0,0.25)',
        borderRadius: 10,
        overflow: 'hidden',
        background: 'transparent',
      }}
      handleClasses={{ left: 'cursor-ew-resize' }}
    >
      {/* Header (minimal toolbar): left=title, right=[Code □] | theme select */}
      <div
        className="flex items-center justify-between px-2 py-1 text-xs"
        style={{
          backgroundColor: headerBg,
          color: headerFg,
          borderBottom: `1px solid ${borderColor}`,
        }}
      >
        <div className="flex items-center gap-2">
          <span style={{ opacity: 0.85, fontWeight: 600 }}>{title}</span>
          {hint && (
            <span
              className="ml-1"
              style={{ opacity: 0.65, fontStyle: 'italic' }}
            >
              {hint}
            </span>
          )}
        </div>

        <div className="flex items-center gap-3">
          <label
            title="Toggle code preview"
            className="flex items-center gap-1 cursor-pointer select-none"
            style={{ opacity: 0.9 }}
          >
            <span>Code</span>
            <input
              type="checkbox"
              checked={!collapsed}
              onChange={(e) => handleCheckbox(e.target.checked)}
            />
          </label>

          <select
            aria-label="Theme"
            value={theme}
            onChange={(e) =>
              onThemeChange?.(e.target.value as 'light' | 'dark')
            }
            className="px-1 py-[2px] rounded"
            style={{
              fontSize: 12,
              background: 'transparent',
              color: 'inherit',
              border:
                theme === 'dark'
                  ? '1px solid rgba(255,255,255,0.2)'
                  : '1px solid rgba(0,0,0,0.2)',
            }}
          >
            <option value="dark">dark</option>
            <option value="light">light</option>
          </select>
        </div>
      </div>

      {/* Body (code) */}
      {!collapsed && (
        <div
          style={{
            maxHeight,
            overflow: 'auto',
            background: bodyBg,
          }}
        >
          <pre
            ref={preRef}
            className="line-numbers"
            style={{
              margin: 0,
              padding: '10px 12px',
              fontSize: 12,
              tabSize: 2,
              whiteSpace: 'pre',
              color: theme === 'dark' ? '#eaeef2' : '#1f2328',
            }}
          >
            <code className={`language-${language}`}>{visibleCode}</code>
          </pre>
        </div>
      )}

      {/* Footer (actions): Copy + Run */}
      {!collapsed && (
        <div
          className="flex items-center justify-end gap-2 px-2 py-1"
          style={{
            backgroundColor: headerBg,
            color: headerFg,
            borderTop: `1px solid ${borderColor}`,
          }}
        >
          <button
            onClick={handleCopy}
            className="px-2 py-1 rounded"
            title="Copy"
            style={{
              background: theme === 'dark' ? '#374151' : '#e5e7eb',
              color: theme === 'dark' ? '#fff' : '#111',
            }}
          >
            Copy
          </button>
          {onExecute && (
            <button
              onClick={onExecute}
              disabled={!!executing || !canExecute}
              className="px-2 py-1 rounded disabled:cursor-not-allowed"
              title="Run"
              style={{
                background: executing
                  ? theme === 'dark'
                    ? '#6b7280'
                    : '#c7cbd1'
                  : theme === 'dark'
                    ? '#059669'
                    : '#10b981',
                color: '#fff',
                opacity: !!executing || !canExecute ? 0.7 : 1,
              }}
            >
              {executing ? 'Running…' : 'Run'}
            </button>
          )}
        </div>
      )}
    </Resizable>
  );
}

export default CodePip;
