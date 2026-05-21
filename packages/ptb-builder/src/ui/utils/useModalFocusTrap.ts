import { useEffect } from 'react';

type FocusableContainerRef<T extends HTMLElement = HTMLElement> = {
  current: T | null | undefined;
};

export type ModalFocusTrapOptions<T extends HTMLElement = HTMLElement> = {
  initialFocusRef?: FocusableContainerRef<HTMLElement>;
  onClose: () => void;
  open: boolean;
  panelRef: FocusableContainerRef<T>;
};

const FOCUSABLE_SELECTOR =
  'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"]), [contenteditable="true"]';

function focusableElements(panel: HTMLElement): HTMLElement[] {
  return Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
    .filter((element) => !element.hasAttribute('disabled'))
    .filter((element) => element.getAttribute('aria-disabled') !== 'true')
    .filter((element) => element.tabIndex >= 0);
}

export function useModalFocusTrap<T extends HTMLElement = HTMLElement>({
  initialFocusRef,
  onClose,
  open,
  panelRef,
}: ModalFocusTrapOptions<T>) {
  useEffect(() => {
    if (!open || typeof document === 'undefined') return;
    const panel = panelRef.current;
    if (!panel) return;

    const previousActiveElement =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : undefined;
    const initialFocus =
      initialFocusRef?.current ?? focusableElements(panel)[0] ?? panel;

    if (!panel.hasAttribute('tabindex')) {
      panel.setAttribute('tabindex', '-1');
    }
    initialFocus.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key !== 'Tab') return;

      const items = focusableElements(panel);
      if (items.length === 0) {
        event.preventDefault();
        panel.focus();
        return;
      }

      const first = items[0]!;
      const last = items[items.length - 1]!;
      const activeElement = document.activeElement;

      if (event.shiftKey) {
        if (!panel.contains(activeElement) || activeElement === first) {
          event.preventDefault();
          last.focus();
        }
        return;
      }

      if (!panel.contains(activeElement) || activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      if (
        previousActiveElement &&
        document.contains(previousActiveElement) &&
        typeof previousActiveElement.focus === 'function'
      ) {
        previousActiveElement.focus();
      }
    };
  }, [initialFocusRef, onClose, open, panelRef]);
}
