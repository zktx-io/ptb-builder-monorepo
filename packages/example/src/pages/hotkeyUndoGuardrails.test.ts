import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const pageRoot = fileURLToPath(new URL('.', import.meta.url));

describe('PTB hotkey undo guardrails', () => {
  it('uses provider-owned undo and redo instead of document callback history', () => {
    for (const file of ['editor.tsx', 'viewer.tsx']) {
      const text = readFileSync(new URL(file, import.meta.url), 'utf8');
      const undoStart = text.indexOf("'meta+z,ctrl+z'");
      const redoStart = text.indexOf("'meta+shift+z,ctrl+shift+z,ctrl+y'");
      const undoSegment = text.slice(undoStart, redoStart);
      const redoSegment = text.slice(redoStart);

      expect(
        undoStart,
        `${pageRoot}/${file} undo hotkey`,
      ).toBeGreaterThanOrEqual(0);
      expect(redoStart, `${pageRoot}/${file} redo hotkey`).toBeGreaterThan(
        undoStart,
      );
      expect(text).not.toContain('usePtbUndo');
      expect(text).not.toContain('beginUndo');
      expect(text).not.toContain('beginRedo');
      expect(text).not.toContain('restoreFromDoc');
      expect(text).not.toContain('captureCurrentDocResult');
      expect(undoSegment).toContain('undo();');
      expect(redoSegment).toContain('redo();');
    }
  });
});
