// src/ui/handles/PTBHandleIO.tsx

/** IO handle component.
 *  - Stable handle id is derived via buildHandleId(port) and may include a
 *    coarse type suffix (e.g., ":number", ":object", "vector<number>").
 *  - Connection validation uses structured PTB types resolved from the store
 *    (findPortTypeFromStore) and applies isTypeCompatible() semantics.
 *  - Visual category/glyphs are purely cosmetic; they do not affect validation.
 *  - NOTE: The PTB model permits vector<object>/option<object> for decode and
 *    forward-compat. UI-level creation of such shapes may be disabled.
 */

import React, { useMemo } from 'react';

import {
  type Connection,
  Handle,
  type HandleProps,
  type IsValidConnection,
  Position,
  useStore,
} from '@xyflow/react';

import {
  findPortTypeFromStore,
  hasConcreteEnds,
  isIOTargetBusy,
  isSelfEdge,
} from './handleUtils';
import {
  ioCategoryOf,
  ioCategoryOfSerialized,
  isOptionSerialized,
  isTypeCompatible,
  isVectorSerialized,
} from '../../ptb/graph/typecheck';
import { buildHandleId, serializePTBType } from '../../ptb/graph/types';
import type { Port, PTBType } from '../../ptb/graph/types';

/** Strict check: true only for PTB vector<T> (structured type). */
function isVectorType(t?: PTBType): boolean {
  return !!t && t.kind === 'vector';
}

type PTBHandleIOProps = Omit<HandleProps, 'type' | 'position' | 'id'> & {
  port: Port;
  position: Position;
  label?: string;
  labelGap?: number; // px
};

export function PTBHandleIO({
  port,
  position,
  className,
  style,
  label,
  labelGap = 1,
  ...rest
}: PTBHandleIOProps) {
  const nodes = useStore(
    (s) =>
      ('getNodes' in s ? (s as any).getNodes() : (s as any).nodes) as any[],
  );
  const edges = useStore((s) => ((s as any).edges as any[]) || []);

  // Stable RF handle id (may include ":type" suffix for IO)
  const handleId = useMemo(() => buildHandleId(port), [port]);

  // Serialized hint is for badges/debug only; not the source of truth.
  const serializedHint = useMemo(
    () =>
      port.typeStr ??
      (port.dataType ? serializePTBType(port.dataType) : undefined),
    [port.typeStr, port.dataType],
  );

  // Category coloring: prefer structured type; fall back to serialized type string.
  const category = useMemo(() => {
    const c = ioCategoryOf(port.dataType);
    return c !== 'unknown' ? c : ioCategoryOfSerialized(serializedHint);
  }, [serializedHint, port.dataType]);

  // Vector/Option glyphs: visual hints only; they do not change validation rules.
  const isVector =
    isVectorType(port.dataType) || isVectorSerialized(serializedHint);

  const isOption =
    (!!port.dataType && port.dataType.kind === 'option') ||
    isOptionSerialized(serializedHint);

  // Connection validation via structured types from the store
  const isValidConnection: IsValidConnection = (edgeOrConn) => {
    const c = edgeOrConn as Connection;
    if (!hasConcreteEnds(c)) return false;
    if (isSelfEdge(c)) return false;
    if (isIOTargetBusy(edges, c)) return false;

    const srcT = findPortTypeFromStore(nodes, c.source!, c.sourceHandle as any);
    const dstT = findPortTypeFromStore(nodes, c.target!, c.targetHandle as any);
    if (!srcT || !dstT) return false;

    return isTypeCompatible(srcT, dstT);
  };

  /** Build a human-friendly tooltip:
   *  - Prefer structured PTB type (preserving object typeTag when present).
   *  - Fall back to serialized type string.
   *  - For unknown, show debugInfo if available; otherwise "unknown".
   */
  const typeTooltip = useMemo(() => {
    const t = port.dataType;

    // Unknown → show debugInfo only
    if (!t || t.kind === 'unknown') {
      const dbg = (t as any)?.debugInfo;
      return typeof dbg === 'string' && dbg.trim().length > 0 ? dbg : 'unknown';
    }

    // object and vector<object> get readable forms using typeTag
    if (t.kind === 'object') {
      return t.typeTag ? `object<${t.typeTag}>` : 'object';
    }
    if (t.kind === 'vector' && t.elem?.kind === 'object') {
      const tt = (t.elem as any)?.typeTag;
      return tt ? `vector<object<${tt}>>` : 'vector<object>';
    }

    // everything else: use serialized fallback (e.g., vector<u64>, number, bool)
    return serializePTBType(t) || undefined;
  }, [port.dataType]);

  const isLeft = position === Position.Left;
  const colorVarName = `--ptb-io-${category}-stroke`;

  return (
    <Handle
      {...rest}
      id={handleId}
      type={port.direction === 'in' ? 'target' : 'source'}
      position={position}
      className={[
        'ptb-handle',
        'ptb-handle--io',
        `ptb-handle--${port.direction === 'in' ? 'in' : 'out'}`,
        isVector
          ? 'ptb-handle--vector'
          : isOption
            ? 'ptb-handle--option'
            : 'ptb-handle--scalar',
        `ptb-handle--${category}`,
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      style={{
        width: 12,
        height: 12,
        overflow: 'visible',
        color: `var(${colorVarName}, var(--ptb-io-unknown-stroke))`,
        ...(isVector
          ? {}
          : {
              background: `var(${colorVarName}, var(--ptb-io-unknown-stroke))`,
              borderColor: `var(${colorVarName}, var(--ptb-io-unknown-stroke))`,
            }),
        ...(style || {}),
      }}
      // Native tooltip for quick inspection (+ rich unknown debug)
      title={typeTooltip}
      aria-label={
        typeTooltip ? `handle ${port.id} (${typeTooltip})` : `handle ${port.id}`
      }
      data-ptb-type={typeTooltip}
      data-ptb-debug-category={category}
      data-ptb-debug-serialized={serializedHint || ''}
      isValidConnection={isValidConnection}
    >
      {isVector && (
        <span
          className="ptb-handle-glyph ptb-handle-glyph--vector"
          style={{
            background: `var(${colorVarName}, var(--ptb-io-unknown-stroke))`,
          }}
          title={typeTooltip} // also on glyph (in case mouse hits the glyph)
        />
      )}
      {label ? (
        <div
          className={`ptb-handle-label absolute ${isLeft ? 'ptb-handle-label--left' : 'ptb-handle-label--right'} text-xxxs`}
          style={{
            marginLeft: isLeft ? labelGap : undefined,
            marginRight: !isLeft ? labelGap : undefined,
          }}
          data-ptb-handle-label={port.id}
          title={typeTooltip} // tooltip on label too
        >
          {label}
        </div>
      ) : (
        <></>
      )}
    </Handle>
  );
}

export default React.memo(PTBHandleIO);
