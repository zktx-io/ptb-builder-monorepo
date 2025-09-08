// src/ui/CodePip.tsx
import React, { useEffect, useMemo, useRef, useState } from 'react';

import { Copy, PackageSearch, Play } from 'lucide-react';
import Prism from 'prismjs';
import { Resizable } from 're-resizable';

// Prism languages & plugins
import 'prismjs/components/prism-typescript';
import 'prismjs/components/prism-javascript';
import 'prismjs/plugins/line-numbers/prism-line-numbers';
import 'prismjs/plugins/normalize-whitespace/prism-normalize-whitespace';

// Prism CSS (theme + line numbers)
// import 'prismjs/themes/prism-tomorrow.css';
import 'prismjs/plugins/line-numbers/prism-line-numbers.css';

import { AssetsModal } from './AssetsModal';
import { usePtb } from './PtbProvider';
import { type Theme, THEMES } from '../types';

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
  code: string;
  language?: 'typescript' | 'javascript';
  title?: string;
  defaultWidth?: number | string;
  maxHeight?: number | string;

  defaultCollapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;

  emptyText?: string;

  onExecute?: () => Promise<void> | void;
  executing?: boolean;
  canExecute?: boolean;

  onCopy?: (text: string) => Promise<void> | void;
  onAssetPick?: (obj: { objectId: string; typeTag: string }) => void;
};

/** Inline transient hint label */
function useInlineHint(timeoutMs = 1200) {
  const [hint, setHint] = useState<string | undefined>(undefined);
  const timer = useRef<number | undefined>();
  useEffect(() => {
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, []);
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

  defaultCollapsed = false,
  onCollapsedChange,

  emptyText = '// No code yet. Connect nodes or change values to see generated code.',

  onExecute,
  executing,
  canExecute = true,

  onCopy,
  onAssetPick,
}: CodePipProps) {
  // eslint-disable-next-line no-restricted-syntax
  const preRef = useRef<HTMLPreElement | null>(null);
  // eslint-disable-next-line no-restricted-syntax
  const codeRef = useRef<HTMLElement | null>(null);
  const [collapsed, setCollapsed] = useState<boolean>(!!defaultCollapsed);
  const [assetsOpen, setAssetsOpen] = useState(false);
  const { hint, show } = useInlineHint();
  const { readOnly, setTheme, theme, execOpts } = usePtb();

  // Normalize code for Prism; fallback to empty placeholder
  const normalized = useMemo(() => code ?? '', [code]);
  const visibleCode = normalized.trim().length ? normalized : emptyText;

  // Prism highlight when visible
  useEffect(() => {
    if (collapsed) return;
    if (!codeRef.current) return;
    try {
      Prism.highlightElement(codeRef.current);
    } catch {
      // no-op
    }
  }, [visibleCode, language, collapsed]);

  const handleCopy = async () => {
    try {
      const text = visibleCode;

      if (onCopy) {
        await onCopy(text);
      } else if (
        typeof navigator !== 'undefined' &&
        navigator?.clipboard?.writeText
      ) {
        await navigator.clipboard.writeText(text);
      } else if (typeof document !== 'undefined') {
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

  const handleOpenAssets = () => {
    try {
      setAssetsOpen(true);
    } catch {
      show('Failed to open Assets');
    }
  };

  const handleCheckbox = (checked: boolean) => {
    setCollapsed(!checked);
    onCollapsedChange?.(!checked);
  };

  return (
    <>
      <Resizable
        className="ptb-codepip"
        defaultSize={{ width: defaultWidth, height: 'auto' }}
        minWidth={280}
        maxWidth={640}
        enable={{ left: true }}
        handleClasses={{ left: 'ptb-resize-handle' }}
      >
        {/* Header */}
        <div className="ptb-codepip__header flex items-center justify-between px-2 py-1 text-xs">
          <div className="flex items-center gap-2">
            <span className="font-semibold opacity-85">{title}</span>
            <span aria-live="polite" className="ml-1 italic opacity-65">
              {hint}
            </span>
          </div>

          <div className="flex items-center gap-3">
            <label
              title="Toggle code preview"
              className="flex items-center gap-1 cursor-pointer select-none opacity-90"
            >
              <span>Code</span>
              <input
                type="checkbox"
                checked={!collapsed}
                onChange={(e) => handleCheckbox(e.target.checked)}
                aria-label="Toggle code preview"
              />
            </label>

            <select
              aria-label="Theme"
              value={theme}
              onChange={(e) => setTheme?.(e.target.value as Theme)}
              className="ptb-codepip__theme px-1 py-[2px] rounded text-[12px]"
            >
              {THEMES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Body (code) */}
        {!collapsed && (
          <div
            className="ptb-codepip__body"
            style={{ maxHeight, overflow: 'auto' }}
          >
            <pre
              ref={preRef}
              className="line-numbers m-0 p-[10px] px-[12px] text-[12px] whitespace-pre"
            >
              <code
                ref={codeRef}
                className={`language-${language}`}
                key={language}
              >
                {visibleCode}
              </code>
            </pre>
          </div>
        )}

        {/* Footer (actions) */}
        {!collapsed && (
          <div className="ptb-codepip__footer flex items-center justify-end gap-2 px-2 py-1">
            <button
              type="button"
              onClick={handleCopy}
              className="ptb-codepip__btn ptb-codepip__btn--copy"
              title="Copy"
            >
              <Copy size={16} />
            </button>

            {onAssetPick && !readOnly && (
              <button
                type="button"
                onClick={handleOpenAssets}
                disabled={!onAssetPick}
                className="ptb-codepip__btn ptb-codepip__btn--assets disabled:cursor-not-allowed"
                title="Assets"
                aria-label="Open Assets"
              >
                <PackageSearch size={16} />
              </button>
            )}

            {onExecute && !readOnly && (
              <button
                type="button"
                onClick={onExecute}
                disabled={!!executing || !canExecute}
                aria-disabled={!!executing || !canExecute}
                aria-busy={!!executing}
                className="ptb-codepip__btn ptb-codepip__btn--run disabled:cursor-not-allowed"
                title="Run"
              >
                <Play size={16} />
              </button>
            )}
          </div>
        )}
      </Resizable>

      {/* Assets modal */}
      <AssetsModal
        open={assetsOpen}
        onClose={() => setAssetsOpen(false)}
        owner={execOpts.myAddress || ''}
        onPick={(it) => onAssetPick?.(it)}
      />
    </>
  );
}

export default CodePip;
