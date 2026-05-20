// src/ui/AssetsModal.tsx
import { useCallback, useEffect, useRef, useState } from 'react';

import { ImageOff, Loader2, X } from 'lucide-react';
import { createPortal } from 'react-dom';

import { usePtb } from './PtbProvider';
import type { ObjectAuthoringInfo } from '../ptb/objectAuthoring';

export type OwnedItem = {
  objectId: string;
  typeTag: string;
  imageUrl?: string;
  authoring?: ObjectAuthoringInfo;
};

const SAFE_DATA_IMAGE_MIME = new Set([
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'image/avif',
]);

function safeAssetImageUrl(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (trimmed.startsWith('data:')) {
    const separatorIndex = trimmed.indexOf(';');
    if (separatorIndex < 0) return undefined;
    const mime = trimmed.slice(5, separatorIndex).toLowerCase();
    return SAFE_DATA_IMAGE_MIME.has(mime) ? trimmed : undefined;
  }
  try {
    const url = new URL(trimmed);
    return url.protocol === 'https:' || url.protocol === 'http:'
      ? url.toString()
      : undefined;
  } catch {
    return undefined;
  }
}

export type AssetsModalProps = {
  open: boolean;
  onClose: () => void;
  owner: string;
  onPick: (obj: OwnedItem) => void;
  pageSize?: number;
};

function short(id: string, l = 8, r = 6) {
  if (!id) return '';
  if (id.length <= l + r + 3) return id;
  return `${id.slice(0, l)}…${id.slice(-r)}`;
}

const NFT_FILTER_KEY = 'ptb-assets-nft-only';

function isNFT(item: OwnedItem): boolean {
  const t = (item.typeTag || '').toLowerCase();
  // NFTs typically have display data with images and are not coins
  return !!item.imageUrl && !t.includes('::coin::coin<');
}

export function AssetsModal({
  open,
  onClose,
  owner,
  onPick,
  pageSize = 50,
}: AssetsModalProps) {
  const { getOwnedObjects, toast } = usePtb();

  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<OwnedItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | undefined>(undefined);
  const [prevStack, setPrevStack] = useState<string[]>([]);
  const [hasNext, setHasNext] = useState(false);
  const [nftOnly, setNftOnly] = useState<boolean>(() => {
    try {
      return localStorage.getItem(NFT_FILTER_KEY) === 'true';
    } catch {
      return false;
    }
  });
  const requestIdRef = useRef(0);
  const mountedRef = useRef(true);
  const panelRef = useRef<HTMLDivElement | undefined>(undefined);

  const canPrev = prevStack.length > 0;

  const handleNftToggle = (checked: boolean) => {
    setNftOnly(checked);
    try {
      localStorage.setItem(NFT_FILTER_KEY, String(checked));
    } catch {
      // ignore localStorage errors
    }
  };

  const filteredItems = nftOnly ? items.filter(isNFT) : items;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      requestIdRef.current += 1;
    };
  }, []);

  useEffect(() => {
    if (!open) {
      requestIdRef.current += 1;
      setLoading(false);
    }
  }, [open]);

  const loadPage = useCallback(
    async (cursor?: string, pushPrev?: boolean) => {
      if (!open) return;
      if (!owner) {
        toast?.({ message: 'Owner address is missing.', variant: 'warning' });
        return;
      }
      const requestId = (requestIdRef.current += 1);
      const isCurrentRequest = () =>
        mountedRef.current && requestIdRef.current === requestId;
      try {
        setLoading(true);
        const res: any = await getOwnedObjects?.({
          owner,
          cursor,
          limit: pageSize,
        });

        const list: OwnedItem[] = (res?.data ?? [])
          .map((r: any) => {
            const id = r?.data?.objectId as string | undefined;
            const display = (r?.data as any)?.display?.data ?? {};
            const imageUrl =
              display?.image_url ??
              display?.imageUrl ??
              display?.img_url ??
              display?.img;
            const type =
              r?.data?.content?.dataType === 'moveObject'
                ? (r?.data?.content?.type as string)
                : ((r?.data?.type as string) ?? '');
            return id
              ? {
                  objectId: id,
                  typeTag: type || '',
                  authoring: r?.data?.authoring,
                  imageUrl: safeAssetImageUrl(imageUrl),
                }
              : undefined;
          })
          .filter(Boolean) as OwnedItem[];

        if (!isCurrentRequest()) return;

        if (pushPrev && typeof cursor === 'string') {
          setPrevStack((s) => [...s, cursor]);
        }

        setItems(list);
        setNextCursor(res?.nextCursor ?? undefined);
        setHasNext(!!res?.hasNextPage);
      } catch {
        if (!isCurrentRequest()) return;
        toast?.({ message: 'Failed to load owned objects.', variant: 'error' });
        setItems([]);
        setNextCursor(undefined);
        setHasNext(false);
      } finally {
        if (isCurrentRequest()) {
          setLoading(false);
        }
      }
    },
    [getOwnedObjects, open, owner, pageSize, toast],
  );

  const onNext = () => {
    if (!hasNext || loading) return;
    loadPage(nextCursor, true);
  };

  const onPrev = () => {
    if (!canPrev || loading) return;
    const prev = prevStack.slice(0, -1);
    const backCursor = prev.length ? prev[prev.length - 1] : undefined;
    setPrevStack(prev);
    loadPage(backCursor, false);
  };

  useEffect(() => {
    if (open) {
      setItems([]);
      setNextCursor(undefined);
      setPrevStack([]);
      setHasNext(false);
      loadPage(undefined, false);
    }
  }, [loadPage, open]);

  const handleClose = useCallback(() => {
    onClose();
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    if (!panel) return;
    const focusableSelector =
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
    const focusable = Array.from(
      panel.querySelectorAll<HTMLElement>(focusableSelector),
    ).filter((element) => !element.hasAttribute('disabled'));
    focusable[0]?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        handleClose();
        return;
      }
      if (event.key !== 'Tab') return;
      const items = Array.from(
        panel.querySelectorAll<HTMLElement>(focusableSelector),
      ).filter((element) => !element.hasAttribute('disabled'));
      if (items.length === 0) return;
      const first = items[0]!;
      const last = items[items.length - 1]!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    panel.addEventListener('keydown', onKeyDown);
    return () => panel.removeEventListener('keydown', onKeyDown);
  }, [handleClose, open]);

  const handlePick = (item: OwnedItem) => {
    onPick(item);
    handleClose();
  };

  if (!open) return <></>;

  const modal = (
    <div
      className="ptb-modal"
      data-ptb-builder
      role="dialog"
      aria-modal="true"
      onClick={handleClose}
    >
      <div
        ref={(element) => {
          panelRef.current = element ?? undefined;
        }}
        className="ptb-modal__panel"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="ptb-modal__header">
          <div className="flex items-center gap-3">
            <span className="ptb-modal__title">Assets</span>
            <span className="ptb-modal__subtitle">Owner: {short(owner)}</span>
          </div>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <span style={{ fontSize: '14px', userSelect: 'none' }}>NFT</span>
              <input
                type="checkbox"
                checked={nftOnly}
                onChange={(e) => handleNftToggle(e.target.checked)}
                className="cursor-pointer"
              />
            </label>
            <button
              type="button"
              onClick={handleClose}
              className="ptb-modal__close"
              aria-label="Close"
            >
              <X size={16} strokeWidth={2.25} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="ptb-modal__body">
          <div className={nftOnly ? 'ptb-modal__grid' : 'ptb-modal__list'}>
            {loading ? (
              <div className="ptb-modal__list-loading gap-2">
                <Loader2 className="animate-spin" />
                <span>Loading…</span>
              </div>
            ) : filteredItems.length === 0 ? (
              <div className="ptb-modal__list-empty">
                {nftOnly ? 'No NFTs found' : 'No objects'}
              </div>
            ) : nftOnly ? (
              <div className="ptb-modal__grid-container">
                {filteredItems.map((it) => (
                  <button
                    type="button"
                    key={it.objectId}
                    className="ptb-modal__grid-item"
                    onClick={() => handlePick(it)}
                    title={`${short(it.objectId, 12, 8)}\n${it.typeTag}`}
                  >
                    {it.imageUrl ? (
                      <img
                        src={it.imageUrl}
                        alt={it.objectId}
                        referrerPolicy="no-referrer"
                        className="ptb-modal__grid-img"
                        onError={(e) => {
                          const target = e.target as HTMLImageElement;
                          target.style.display = 'none';
                          const placeholder = target.nextElementSibling;
                          if (placeholder) {
                            (placeholder as HTMLElement).style.display = 'flex';
                          }
                        }}
                      />
                    ) : undefined}
                    <div
                      className="ptb-modal__grid-placeholder"
                      style={{ display: it.imageUrl ? 'none' : 'flex' }}
                    >
                      <ImageOff size={28} />
                      <span className="ptb-modal__grid-no-image">No Image</span>
                    </div>
                    <div className="ptb-modal__grid-label">
                      {short(it.objectId, 6, 4)}
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <ul>
                {filteredItems.map((it) => (
                  <li key={it.objectId}>
                    <button
                      type="button"
                      className="ptb-modal__item"
                      onClick={() => handlePick(it)}
                      title={it.typeTag}
                    >
                      {it.imageUrl ? (
                        <div className="ptb-modal__item-img-wrapper">
                          <img
                            src={it.imageUrl}
                            alt={it.objectId}
                            referrerPolicy="no-referrer"
                            className="ptb-modal__item-img"
                            onError={(e) => {
                              const target = e.target as HTMLImageElement;
                              target.style.display = 'none';
                              const placeholder = target.nextElementSibling;
                              if (placeholder) {
                                (placeholder as HTMLElement).style.display =
                                  'flex';
                              }
                            }}
                          />
                          <div
                            className="ptb-modal__item-img-placeholder"
                            style={{ display: 'none' }}
                          >
                            <ImageOff size={16} />
                          </div>
                        </div>
                      ) : (
                        <div className="ptb-modal__item-img-wrapper">
                          <div className="ptb-modal__item-img-placeholder">
                            <ImageOff size={16} />
                          </div>
                        </div>
                      )}
                      <div className="flex-1 ptb-modal__minw-0">
                        <div className="ptb-modal__item-id">{it.objectId}</div>
                        <div className="ptb-modal__item-type">
                          {it.typeTag || '(unknown type)'}
                        </div>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Footer (pagination) */}
          <div className="ptb-modal__footer">
            <button
              type="button"
              className="ptb-modal__btn"
              disabled={!canPrev || loading}
              onClick={onPrev}
            >
              Prev
            </button>
            <button
              type="button"
              className="ptb-modal__btn"
              disabled={!hasNext || loading}
              onClick={onNext}
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  const canPortal = typeof document !== 'undefined' && !!document.body;
  return canPortal ? createPortal(modal, document.body) : modal;
}

export default AssetsModal;
