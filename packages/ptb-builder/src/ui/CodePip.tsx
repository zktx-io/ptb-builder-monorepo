// src/ui/CodePip.tsx
import React, { useEffect, useMemo, useRef, useState } from 'react';

import { Copy, FlaskConical, PackageSearch, Play, Save } from 'lucide-react';
import Prism from 'prismjs';
import { Resizable } from 're-resizable';

// Prism languages & plugins
import 'prismjs/components/prism-typescript';
import 'prismjs/components/prism-javascript';
import 'prismjs/plugins/line-numbers/prism-line-numbers';
import 'prismjs/plugins/normalize-whitespace/prism-normalize-whitespace';

import { AssetsModal } from './AssetsModal';
import { usePtb } from './PtbProvider';
import { type Theme, THEMES } from '../types';

export const EMPTY_CODE = (net?: string) => {
  if (!net) {
    return `// PTB Code Preview
// ⚠ No network is selected yet.
// - Load a document (loadFromDoc) or load a chain transaction (loadFromOnChainTx)
//   to set the active network.
// - Dry-run / Execute are disabled until a network is selected.
//
// Add and connect nodes (Start → … → End) to generate ts-sdk code here.

import { Transaction } from '@mysten/sui/transactions';

const tx = new Transaction();
// tx.setSenderIfNotSet('<your-address>');
// tx.setGasBudgetIfNotSet(500_000_000);

// ...code for your graph will be generated here...

export { tx };
`;
  }

  return `// PTB Code Preview (network: ${net})
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
};

type CodePipProps = {
  code: string;
  language?: 'typescript' | 'javascript';
  title?: string;
  defaultWidth?: number | string;
  maxHeight?: number | string;

  defaultCollapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;

  emptyText?: string;

  /** Shared enable state for both Dry-run and Execute */
  canRunning?: boolean;

  /** Shared running state for both buttons (mutually exclusive UX) */
  isRunning?: boolean;

  /** Actions */
  onDryRun?: () => Promise<void> | void;
  onExecute?: () => Promise<void> | void;

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

  isRunning = false,
  canRunning = true,

  onDryRun,
  onExecute,

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
  const { readOnly, setTheme, theme, execOpts, exportDoc, showExportButton } =
    usePtb();

  // Normalize code for Prism; fallback to empty placeholder
  const normalized = useMemo(() => code ?? '', [code]);
  const visibleCode = normalized.trim().length ? normalized : emptyText;

  // --- Mobile detection to hard-disable resizing and pin width to 100% ---
  // Note: Keep logic here minimal; CSS handles the visual layout.
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    // Use matchMedia to react to viewport width changes
    const mq = window.matchMedia('(max-width: 768px)');
    const handler = () => setIsMobile(mq.matches);
    handler();
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

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
    } catch (e: any) {
      show(e?.message ? `Copy failed: ${e.message}` : 'Copy failed');
    }
  };

  const handleSave = async () => {
    try {
      const doc = exportDoc?.();
      if (!doc) throw new Error('Nothing to export');
      const filename = 'export.ptb';
      // eslint-disable-next-line no-restricted-syntax
      const blob = new Blob([JSON.stringify(doc, null, 2)], {
        type: 'application/x-ptb+json',
      });
      const url = URL.createObjectURL(blob);

      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);

      show('Saved');
    } catch (e: any) {
      show(e?.message ? `Save failed: ${e.message}` : 'Save failed');
    }
  };

  const handleOpenAssets = () => {
    try {
      setAssetsOpen(true);
    } catch (e: any) {
      show(e?.message ? `Open failed: ${e.message}` : 'Failed to open Assets');
    }
  };

  const handleCheckbox = (checked: boolean) => {
    setCollapsed(!checked);
    onCollapsedChange?.(!checked);
  };

  const runButtonsDisabled = !!isRunning || !canRunning;

  return (
    <>
      <Resizable
        className="ptb-codepip"
        bounds="parent"
        defaultSize={{
          width: isMobile ? '100%' : defaultWidth,
          height: 'auto',
        }}
        size={isMobile ? { width: '100%', height: 'auto' } : undefined}
        minWidth={isMobile ? undefined : 280}
        maxWidth={isMobile ? undefined : 640}
        enable={isMobile ? {} : { left: true }}
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
              title="Switch editor theme"
            >
              {THEMES.map((t) => (
                <option key={t} value={t}>
                  {t.replace('-', ' ')}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Body (code) */}
        {!collapsed && (
          <div
            className="ptb-codepip__body"
            style={{ maxHeight, overflow: 'hidden' }}
          >
            <pre
              ref={preRef}
              className="line-numbers m-0 p-[10px] px-[12px] text-[12px] whitespace-pre
               overflow-x-auto overflow-y-auto bg-[var(--ptb-code-bg)]"
            >
              <code
                ref={codeRef}
                className={`language-${language} block min-w-max`}
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
            {/* Copy */}
            <button
              type="button"
              onClick={handleCopy}
              className="ptb-codepip__btn ptb-codepip__btn--neutral"
              title="Copy code to clipboard"
              aria-label="Copy code to clipboard"
            >
              <Copy size={16} />
            </button>

            {/* Save */}
            {showExportButton && (
              <button
                type="button"
                onClick={handleSave}
                className="ptb-codepip__btn ptb-codepip__btn--neutral"
                title="Export document as .ptb"
                aria-label="Export document as .ptb"
              >
                <Save size={16} />
              </button>
            )}

            {/* Assets */}
            {onAssetPick && !readOnly && (
              <button
                type="button"
                onClick={handleOpenAssets}
                disabled={!onAssetPick}
                className="ptb-codepip__btn ptb-codepip__btn--neutral disabled:cursor-not-allowed"
                title="Open your owned assets"
                aria-label="Open Assets"
              >
                <PackageSearch size={16} />
              </button>
            )}

            {/* Dry-run */}
            {onDryRun && !readOnly && (
              <button
                type="button"
                onClick={onDryRun}
                disabled={runButtonsDisabled}
                aria-disabled={runButtonsDisabled}
                aria-busy={!!isRunning}
                className="ptb-codepip__btn ptb-codepip__btn--neutral disabled:cursor-not-allowed"
                title={
                  runButtonsDisabled
                    ? 'Dry run (disabled while running or unavailable)'
                    : 'Dry run the transaction'
                }
                aria-label="Dry run the transaction"
              >
                <FlaskConical size={16} />
              </button>
            )}

            {/* Execute (Primary) */}
            {onExecute && !readOnly && (
              <button
                type="button"
                onClick={onExecute}
                disabled={runButtonsDisabled}
                aria-disabled={runButtonsDisabled}
                aria-busy={!!isRunning}
                className="ptb-codepip__btn ptb-codepip__btn--primary disabled:cursor-not-allowed"
                title={
                  runButtonsDisabled
                    ? 'Run (disabled while running or unavailable)'
                    : 'Execute the transaction'
                }
                aria-label="Execute the transaction"
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
