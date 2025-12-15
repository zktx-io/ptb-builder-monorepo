// src/ui/AssetsModal.tsx
import React, { useEffect, useState } from 'react';

import { Boxes, Coins, FileBox, Loader2, X } from 'lucide-react';
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
  const [preview, setPreview] = useState<
    | {
        url: string;
        x: number;
        y: number;
      }
    | undefined
  >(undefined);

  const canPrev = prevStack.length > 0;

  const loadPage = async (cursor?: string, pushPrev?: boolean) => {
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
  };

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

  const showPreview = (e: React.MouseEvent, url?: string) => {
    if (!url) return;
    setPreview({
      url,
      x: e.clientX + 14,
      y: e.clientY + 14,
    });
  };

  const movePreview = (e: React.MouseEvent) => {
    setPreview((p) => (p ? { ...p, x: e.clientX + 14, y: e.clientY + 14 } : p));
  };

  const hidePreview = () => setPreview(undefined);

  useEffect(() => {
    if (open) {
      setItems([]);
      setNextCursor(undefined);
      setPrevStack([]);
      setHasNext(false);
      loadPage(undefined, false);
    }
    if (!open) {
      hidePreview();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, owner]);

  const handleClose = () => {
    hidePreview();
    onClose();
  };

  const handlePick = (item: OwnedItem) => {
    hidePreview();
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
          <button
            type="button"
            onClick={handleClose}
            className="p-1 rounded hover:opacity-80"
            aria-label="Close"
          >
            <X />
          </button>
        </div>

        {/* Body */}
        <div className="ptb-modal__body">
          <div className="ptb-modal__list">
            {loading ? (
              <div className="ptb-modal__list-loading gap-2">
                <Loader2 className="animate-spin" />
                <span>Loading…</span>
              </div>
            ) : items.length === 0 ? (
              <div className="ptb-modal__list-empty">No objects</div>
            ) : (
              <ul>
                {items.map((it) => (
                  <li
                    key={it.objectId}
                    className="ptb-modal__item"
                    onMouseEnter={(e) => showPreview(e, it.imageUrl)}
                    onMouseMove={movePreview}
                    onMouseLeave={hidePreview}
                    onClick={() => handlePick(it)}
                    title={it.typeTag}
                  >
                    <AssetIcon typeTag={it.typeTag} />
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
      {preview?.url && (
        <div
          className="ptb-modal__preview"
          style={{ left: preview.x, top: preview.y }}
        >
          <img src={preview.url} alt="NFT preview" />
        </div>
      )}
    </div>
  );

  const canPortal = typeof document !== 'undefined' && !!document.body;
  return canPortal ? createPortal(modal, document.body) : modal;
}

export default AssetsModal;
