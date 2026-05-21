import { useEffect, useRef, useState } from 'react';

import { X } from 'lucide-react';
import { createPortal } from 'react-dom';

import {
  parseVectorDraftText,
  type VectorEditorItem,
  vectorValueToDraftText,
} from './vectorValue';
import type { PTBType } from '../../../ptb/graph/types';
import { useModalFocusTrap } from '../../utils/useModalFocusTrap';

export type VectorEditorModalProps = {
  elemType?: PTBType;
  onApply: (value: VectorEditorItem[]) => void;
  onClose: () => void;
  open: boolean;
  title: string;
  value: unknown;
};

export function VectorEditorModal({
  elemType,
  onApply,
  onClose,
  open,
  title,
  value,
}: VectorEditorModalProps) {
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | undefined>(undefined);
  const panelRef = useRef<HTMLDivElement | undefined>(undefined);
  const textareaRef = useRef<HTMLTextAreaElement | undefined>(undefined);

  useEffect(() => {
    if (!open) return;
    setDraft(vectorValueToDraftText(value));
    setError(undefined);
  }, [open, value]);

  useModalFocusTrap({
    initialFocusRef: textareaRef,
    onClose,
    open,
    panelRef,
  });

  if (!open) return <></>;

  const handleApply = () => {
    const parsed = parseVectorDraftText(draft, elemType);
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }
    onApply(parsed.value);
    onClose();
  };

  const modal = (
    <div
      className="ptb-modal"
      data-ptb-builder
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        ref={(element) => {
          panelRef.current = element ?? undefined;
        }}
        className="ptb-modal__panel"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="ptb-modal__header">
          <div className="flex min-w-0 items-center gap-3">
            <span className="ptb-modal__title">Vector</span>
            <span className="ptb-modal__subtitle truncate">{title}</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="ptb-modal__close"
            aria-label="Close"
          >
            <X size={16} strokeWidth={2.25} />
          </button>
        </div>
        <div className="ptb-modal__body">
          <textarea
            ref={(element) => {
              textareaRef.current = element ?? undefined;
            }}
            className="ptb-vector-editor__textarea"
            value={draft}
            onChange={(event) => {
              setDraft(event.target.value);
              if (error) setError(undefined);
            }}
            spellCheck={false}
            aria-label="Vector items"
          />
          {error ? (
            <div className="ptb-vector-editor__error">{error}</div>
          ) : undefined}
          <div className="ptb-modal__footer">
            <button type="button" className="ptb-modal__btn" onClick={onClose}>
              Cancel
            </button>
            <button
              type="button"
              className="ptb-modal__btn"
              onClick={handleApply}
            >
              Apply
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  const canPortal = typeof document !== 'undefined' && !!document.body;
  return canPortal ? createPortal(modal, document.body) : modal;
}

export default VectorEditorModal;
