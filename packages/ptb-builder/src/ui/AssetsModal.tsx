// src/ui/AssetsModal.tsx
import React, { useCallback, useEffect, useState } from 'react';

import { Boxes, Coins, FileBox, ImageOff, Loader2, X } from 'lucide-react';
import { createPortal } from 'react-dom';

import { usePtb } from './PtbProvider';

type OwnedItem = { objectId: string; typeTag: string; imageUrl?: string };

export type AssetsModalProps = {
  open: boolean;
  onClose: () => void;
  owner: string;
  onPick: (obj: OwnedItem) => void;
  pageSize?: number;
};

function AssetIcon({ typeTag }: { typeTag: string }) {
  const t = (typeTag || '').toLowerCase();
  if (t.includes('::coin::coin<')) return <Coins size={16} />;
  if (t.includes('::package') || t.includes('::module'))
    return <Boxes size={16} />;
  return <FileBox size={16} />;
}

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
  const [failedImages, setFailedImages] = useState<Set<string>>(new Set());

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

  const loadPage = useCallback(
    async (cursor?: string, pushPrev?: boolean) => {
      if (!open) return;
      if (!owner) {
        toast?.({ message: 'Owner address is missing.', variant: 'warning' });
        return;
      }
      try {
        setLoading(true);
        const res: any = await getOwnedObjects?.({
          owner,
          options: { showType: true, showContent: true, showDisplay: true },
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
                  imageUrl: typeof imageUrl === 'string' ? imageUrl : undefined,
                }
              : undefined;
          })
          .filter(Boolean) as OwnedItem[];

        if (pushPrev && typeof cursor === 'string') {
          setPrevStack((s) => [...s, cursor]);
        }

        setItems(list);
        setNextCursor(res?.nextCursor ?? undefined);
        setHasNext(!!res?.hasNextPage);
      } catch {
        toast?.({ message: 'Failed to load owned objects.', variant: 'error' });
        setItems([]);
        setNextCursor(undefined);
        setHasNext(false);
      } finally {
        setLoading(false);
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
    setPrevStack((s) => {
      const prev = s.slice(0, -1);
      const backCursor = prev.length ? prev[prev.length - 1] : undefined;
      loadPage(backCursor, false);
      return prev;
    });
  };

  useEffect(() => {
    if (open) {
      setItems([]);
      setNextCursor(undefined);
      setPrevStack([]);
      setHasNext(false);
      setFailedImages(new Set());
      loadPage(undefined, false);
    }
  }, [loadPage, open]);

  const handleClose = () => {
    onClose();
  };

  const handlePick = (item: OwnedItem) => {
    onPick(item);
    handleClose();
  };

  if (!open) return <></>;

  const modal = (
    <div
      className="ptb-modal"
      role="dialog"
      aria-modal="true"
      onClick={handleClose}
    >
      <div className="ptb-modal__panel" onClick={(e) => e.stopPropagation()}>
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
              className="p-1 rounded hover:opacity-80"
              aria-label="Close"
            >
              <X />
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
                  <div
                    key={it.objectId}
                    className="ptb-modal__grid-item"
                    onClick={() => handlePick(it)}
                    title={`${short(it.objectId, 12, 8)}\n${it.typeTag}`}
                  >
                    {it.imageUrl ? (
                      <img
                        src={it.imageUrl}
                        alt={it.objectId}
                        className="ptb-modal__grid-img"
                        onError={(e) => {
                          const target = e.target as HTMLImageElement;
                          target.style.display = 'none';
                          const placeholder = target.nextElementSibling;
                          if (placeholder) {
                            (placeholder as HTMLElement).style.display = 'flex';
                          }
                          // Track failed image to prevent preview tooltip
                          if (it.imageUrl) {
                            setFailedImages((prev) =>
                              new Set(prev).add(it.imageUrl!),
                            );
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
                  </div>
                ))}
              </div>
            ) : (
              <ul>
                {filteredItems.map((it) => (
                  <li
                    key={it.objectId}
                    className="ptb-modal__item"
                    onClick={() => handlePick(it)}
                    title={it.typeTag}
                  >
                    {it.imageUrl ? (
                      <div className="ptb-modal__item-img-wrapper">
                        <img
                          src={it.imageUrl}
                          alt={it.objectId}
                          className="ptb-modal__item-img"
                          onError={(e) => {
                            const target = e.target as HTMLImageElement;
                            target.style.display = 'none';
                            const placeholder = target.nextElementSibling;
                            if (placeholder) {
                              (placeholder as HTMLElement).style.display =
                                'flex';
                            }
                            if (it.imageUrl) {
                              setFailedImages((prev) =>
                                new Set(prev).add(it.imageUrl!),
                              );
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
