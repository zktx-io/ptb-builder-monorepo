// src/codegen/preprocess.ts
// -----------------------------------------------------------------------------
// Preprocess PTB graph into Program IR with strict policy:
// - splitCoins: amounts are multiple scalars (no vectors); outputs always N names
// - mergeCoins/transferObjects: multiple scalars (no vectors), recipient RAW
// - makeMoveVec: elements as-is (no pure), produce single out handle name
// - moveCall: build paramKinds strictly from port dataType (NO runtime probing)
// - When an input port has no connection, we insert { kind: 'undef' } explicitly
//   (no nulls anywhere).
// - Vectors: only vector<move_numeric{width}> and vector<scalar(address|bool)>
//   are serialized later; others are 'other'.
// -----------------------------------------------------------------------------

import {
  type CommandNode,
  parseHandleTypeSuffix,
  type PTBGraph,
  type PTBNode,
  type VariableNode,
} from '../ptb/graph/types';
import type { Chain } from '../types';
import {
  type ParamKind,
  type POp,
  type Program,
  type PValue,
  type PVar,
} from './types';

// --- Helpers (naming, flow) --------------------------------------------------

const PLURAL = (base: string) =>
  /(list|array|vec|ids|coins|addresses|objects|values|amounts)$/i.test(base)
    ? base
    : base.toLowerCase().endsWith('y') && !/[aeiou]y$/i.test(base)
      ? base.slice(0, -1) + 'ies'
      : base.toLowerCase().endsWith('s')
        ? base
        : base + 's';

const RESERVED = new Set([
  'var',
  'let',
  'const',
  'function',
  'class',
  'extends',
  'super',
  'return',
  'export',
  'import',
  'default',
  'if',
  'else',
  'switch',
  'case',
  'for',
  'while',
  'do',
  'break',
  'continue',
  'new',
  'delete',
  'try',
  'catch',
  'finally',
  'in',
  'of',
  'void',
  'await',
  'async',
  'yield',
  'with',
  'enum',
  'implements',
  'interface',
  'package',
  'private',
  'protected',
  'public',
  // project locals:
  'tx',
  'SUI',
  'myAddress',
]);

class NamePool {
  private used = new Set<string>();
  constructor(reserved: string[] = []) {
    reserved.forEach((n) => this.used.add(n));
    RESERVED.forEach((n) => this.used.add(n));
  }
  claim(raw: string) {
    let base = (raw || 'val').replace(/[^A-Za-z0-9_]/g, '_') || 'val';
    if (RESERVED.has(base)) base = `${base}_id`;
    if (!/_\d+$/.test(base)) base = `${base}_0`;
    while (this.used.has(base)) {
      base = base.replace(/_(\d+)$/, (_, n) => `_${Number(n) + 1}`);
    }
    this.used.add(base);
    return base;
  }
}

export function flowAdj(graph: PTBGraph) {
  const fwd = new Map<string, string[]>(),
    rev = new Map<string, string[]>();
  for (const n of graph.nodes) {
    fwd.set(n.id, []);
    rev.set(n.id, []);
  }
  for (const e of graph.edges)
    if (e.kind === 'flow') {
      fwd.get(e.source)!.push(e.target);
      rev.get(e.target)!.push(e.source);
    }
  return { fwd, rev };
}

function reach(starts: string[], adj: Map<string, string[]>) {
  const seen = new Set<string>(),
    q = [...starts];
  while (q.length) {
    const id = q.shift()!;
    if (seen.has(id)) continue;
    seen.add(id);
    for (const t of adj.get(id) ?? []) if (!seen.has(t)) q.push(t);
  }
  return seen;
}

export function activeFlowIds(graph: PTBGraph) {
  const starts = graph.nodes.filter((n) => n.kind === 'Start').map((n) => n.id);
  const ends = graph.nodes.filter((n) => n.kind === 'End').map((n) => n.id);
  const { fwd, rev } = flowAdj(graph);
  const fromStart = reach(starts, fwd),
    toEnd = reach(ends, rev);
  const active = new Set<string>();
  for (const id of fromStart) if (toEnd.has(id)) active.add(id);
  return active;
}

export function orderActive(graph: PTBGraph, active: Set<string>) {
  const idToNode = new Map(graph.nodes.map((n) => [n.id, n]));
  const indeg = new Map<string, number>(),
    children = new Map<string, string[]>();
  for (const id of active) {
    indeg.set(id, 0);
    children.set(id, []);
  }
  for (const e of graph.edges)
    if (e.kind === 'flow') {
      if (active.has(e.source) && active.has(e.target)) {
        children.get(e.source)!.push(e.target);
        indeg.set(e.target, (indeg.get(e.target) ?? 0) + 1);
      }
    }
  const q: string[] = [];
  for (const id of active) {
    const n = idToNode.get(id);
    if ((indeg.get(id) ?? 0) === 0 && n?.kind === 'Start') q.push(id);
  }
  for (const id of active)
    if ((indeg.get(id) ?? 0) === 0 && !q.includes(id)) q.push(id);
  const out: string[] = [],
    seen = new Set<string>();
  while (q.length) {
    const id = q.shift()!;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
    for (const t of children.get(id) ?? []) {
      indeg.set(t, (indeg.get(t) ?? 0) - 1);
      if ((indeg.get(t) ?? 0) === 0) q.push(t);
    }
  }
  return out.map((id) => idToNode.get(id)!).filter(Boolean);
}

export function buildIoIndex(edges: PTBGraph['edges']) {
  const io = edges.filter((e) => e.kind === 'io');
  const byTarget = new Map<string, Map<string, typeof io>>();
  for (const e of io) {
    if (!byTarget.has(e.target)) byTarget.set(e.target, new Map());
    const mt = byTarget.get(e.target)!;
    const tgtBase = parseHandleTypeSuffix((e as any).targetHandle).baseId;
    if (tgtBase) mt.set(tgtBase, [...(mt.get(tgtBase) ?? []), e]);
  }
  return { byTarget, ioEdges: io };
}

// --- Variable nodes -> initial PValue ---------------------------------------

function isMyWalletVariable(v: VariableNode) {
  if (v.varType?.kind !== 'scalar' || v.varType.name !== 'address')
    return false;
  const name = (v.name || '').toLowerCase();
  return (
    name.includes('wallet') ||
    name === 'myaddress' ||
    name === 'my_addr' ||
    name === 'sender'
  );
}

function toPValueFromVar(v: VariableNode): PValue {
  const t = v.varType;
  const val = (v as any).value;
  if (!t) return { kind: 'undef' };

  switch (t.kind) {
    case 'scalar':
      if (t.name === 'address')
        return isMyWalletVariable(v)
          ? { kind: 'scalar', value: 'myAddress' }
          : { kind: 'scalar', value: String(val ?? '') };
      if (t.name === 'string')
        return { kind: 'scalar', value: String(val ?? '') };
      if (t.name === 'bool')
        return { kind: 'scalar', value: Boolean(val ?? false) };
      if (t.name === 'number')
        return { kind: 'move_numeric', value: Number(val ?? 0) };
      if (t.name === 'id') return { kind: 'scalar', value: String(val ?? '') };
      return { kind: 'undef' };

    case 'move_numeric':
      return { kind: 'move_numeric', value: Number(val ?? 0) };

    case 'object': {
      const name = (v.name || '').toLowerCase();
      const tag = (t.typeTag ?? '').toLowerCase();
      const s = (v as any).value as string | undefined;
      if (name.includes('gas') || s === 'gas')
        return { kind: 'object', special: 'gas' };
      if (name.includes('system') || tag.includes('sui_system'))
        return { kind: 'object', special: 'system' };
      if (name.includes('clock') || tag.endsWith('::clock::clock'))
        return { kind: 'object', special: 'clock' };
      if (name.includes('random') || tag.endsWith('::random::random'))
        return { kind: 'object', special: 'random' };
      return { kind: 'object', id: String(s ?? '') };
    }

    case 'vector': {
      const items = Array.isArray(val) ? val : [];
      return {
        kind: 'vector',
        items: items.map((x) => {
          if (t.elem.kind === 'move_numeric')
            return { kind: 'move_numeric', value: x as any };
          if (t.elem.kind === 'scalar') {
            if (t.elem.name === 'bool')
              return { kind: 'scalar', value: Boolean(x) };
            return { kind: 'scalar', value: String(x) };
          }
          if (t.elem.kind === 'object')
            return { kind: 'object', id: String(x ?? '') };
          return { kind: 'scalar', value: String(x ?? '') };
        }),
      };
    }

    case 'tuple':
      return {
        kind: 'vector',
        items: (Array.isArray(val) ? val : []).map((x) => ({
          kind: 'scalar',
          value: x as any,
        })),
      };

    default:
      return { kind: 'undef' };
  }
}

// --- ParamKind inference from port dataType ---------------------------------
// Source of truth = node.port.dataType only. No runtime probing, no defaults.
function kindFromDataType(dt: any): ParamKind {
  if (!dt) return 'other';

  // object handle
  if (dt.kind === 'object') return 'txarg';

  // scalar
  if (dt.kind === 'scalar') {
    if (dt.name === 'address') return 'addr';
    if (dt.name === 'bool') return 'bool';
    if (dt.name === 'id') return 'id';
    if (dt.name === 'number') return 'num-u64'; // default numeric width
    if (dt.name === 'string') return 'str';
    return 'other';
  }

  // move numeric scalar
  if (dt.kind === 'move_numeric') {
    const w = String(dt.width ?? '').toLowerCase();
    switch (w) {
      case 'u8':
        return 'num-u8';
      case 'u16':
        return 'num-u16';
      case 'u32':
        return 'num-u32';
      case 'u64':
        return 'num-u64';
      case 'u128':
        return 'num-u128';
      case 'u256':
        return 'num-u256';
      default:
        return 'num';
    }
  }

  // vector
  if (dt.kind === 'vector') {
    const e = dt.elem;
    if (!e) return 'other';

    // vector<scalar>
    if (e.kind === 'scalar') {
      if (e.name === 'address') return 'array-addr';
      if (e.name === 'bool') return 'array-bool';
      // vector<string>/vector<number>/vector<id> are not serialized unless width is explicit
      return 'other';
    }

    // vector<move_numeric{width}>
    if (e.kind === 'move_numeric') {
      const w = String(e.width ?? '').toLowerCase();
      switch (w) {
        case 'u8':
          return 'array-u8';
        case 'u16':
          return 'array-u16';
        case 'u32':
          return 'array-u32';
        case 'u64':
          return 'array-u64';
        case 'u128':
          return 'array-u128';
        case 'u256':
          return 'array-u256';
        default:
          return 'other'; // width missing -> do not serialize
      }
    }

    // vector<object> etc. are not primitive arrays for pure
    return 'other';
  }

  return 'other';
}

// --- Preprocess --------------------------------------------------------------

export function preprocess(graph: PTBGraph, chain: Chain): Program {
  const header = { usedMyAddress: false, usedSuiTypeConst: false };

  const active = activeFlowIds(graph);
  const ordered = orderActive(graph, active);
  const idToNode = new Map(graph.nodes.map((n) => [n.id, n]));
  const { byTarget, ioEdges } = buildIoIndex(graph.edges);

  // Variables used by active commands only
  const usedVarIds = new Set<string>();
  for (const e of ioEdges) {
    if (!active.has(e.target)) continue;
    const src = idToNode.get(e.source);
    if (src?.kind === 'Variable') usedVarIds.add(src.id);
  }

  // `${nodeId}:${portId}` -> symbol names
  const portSyms = new Map<string, string[]>();

  const vars: PVar[] = [];
  const names = new NamePool(['tx', 'SUI', 'myAddress']);

  // Emit variables (raw)
  let varAuto = 1;
  for (const n of graph.nodes) {
    if (!usedVarIds.has(n.id)) continue;
    const v = n as VariableNode;

    let base = (v.name || '').trim() || `val_${varAuto++}`;
    if (v.varType?.kind === 'vector') base = PLURAL(base);
    const sym = names.claim(base);

    const init = toPValueFromVar(v);
    if (init.kind === 'scalar' && (init as any).value === 'myAddress')
      header.usedMyAddress = true;

    vars.push({ name: sym, init });

    for (const p of v.ports || []) {
      if (p.role === 'io' && p.direction === 'out') {
        portSyms.set(`${v.id}:${p.id}`, [sym]);
      }
    }
  }

  // Collect inputs per IN port (refs or literals); fill undef if missing
  const collect = (node: PTBNode) => {
    const byPort = new Map<string, PValue[]>();
    const inPorts = (node.ports || []).filter(
      (p) => p.role === 'io' && p.direction === 'in',
    );

    for (const p of inPorts) {
      const edges = byTarget.get(node.id)?.get(p.id) ?? [];
      const arr: PValue[] = [];
      for (const e of edges) {
        const srcBase = parseHandleTypeSuffix((e as any).sourceHandle).baseId;
        if (!srcBase) continue;
        const srcKey = `${e.source}:${srcBase}`;
        const syms = portSyms.get(srcKey) ?? [];
        for (const s of syms) arr.push({ kind: 'ref', name: s });
      }
      if (arr.length === 0) arr.push({ kind: 'undef' });
      byPort.set(p.id, arr);
    }
    return byPort;
  };

  const ops: POp[] = [];
  let splitSeq = 0;

  for (const node of ordered) {
    if (node.kind !== 'Command') continue;
    const c = node as CommandNode;
    const byPortVals = collect(c);

    switch (c.command) {
      case 'splitCoins': {
        splitSeq += 1;

        const inPorts = (c.ports || []).filter(
          (p) => p.role === 'io' && p.direction === 'in',
        );

        // coin
        const coin = (inPorts.length
          ? (byPortVals.get(inPorts[0].id) ?? [])
          : [])[0] ?? { kind: 'undef' };

        // amounts (no vectors; align to OUT count)
        let amounts: PValue[] = [];
        const outs = (c.ports || []).filter(
          (p) => p.role === 'io' && p.direction === 'out',
        );
        const grouped = (c.ports || []).find(
          (p) =>
            p.role === 'io' &&
            p.direction === 'in' &&
            (p.label === 'amounts' ||
              p.id === 'amounts' ||
              p.id.startsWith('in_amount_')),
        )?.id;

        if (grouped) {
          const got = (byPortVals.get(grouped) ?? []).filter(
            (x) => x.kind !== 'vector',
          );
          if (got.length > 0) {
            amounts = got;
          } else {
            amounts = outs.map(() => ({ kind: 'undef' }) as PValue);
          }
        } else {
          amounts = inPorts.slice(1).map((p) => {
            const vals = (byPortVals.get(p.id) ?? []).filter(
              (x) => x.kind !== 'vector',
            );
            return vals[0] ?? ({ kind: 'undef' } as PValue);
          });
          if (amounts.length === 0) {
            amounts = outs.map(() => ({ kind: 'undef' }) as PValue);
          }
        }

        // outputs: always N names where N = amounts.length
        const namesOut = amounts.map((_, i) =>
          names.claim(`out_${splitSeq}_${i}`),
        );
        ops.push({
          kind: 'splitCoins',
          coin,
          amounts,
          out: { mode: 'destructure', names: namesOut },
        });

        // wire outputs to OUT ports by index
        outs.forEach((p, i) => {
          const nm = namesOut[i] ?? namesOut[namesOut.length - 1];
          portSyms.set(`${c.id}:${p.id}`, [nm]);
        });
        break;
      }

      case 'mergeCoins': {
        const inPorts = (c.ports || []).filter(
          (p) => p.role === 'io' && p.direction === 'in',
        );
        const destination = (inPorts.length
          ? (byPortVals.get(inPorts[0].id) ?? [])
          : [])[0] ?? { kind: 'undef' };

        const sources = inPorts.slice(1).map((p) => {
          const vals = byPortVals.get(p.id) ?? [];
          return vals[0] ?? ({ kind: 'undef' } as PValue);
        });

        ops.push({ kind: 'mergeCoins', destination, sources });
        break;
      }

      case 'transferObjects': {
        const inPorts = (c.ports || []).filter(
          (p) => p.role === 'io' && p.direction === 'in',
        );

        const HINTS = ['recipient', 'to', 'addr', 'address', 'owner'];
        const objects: PValue[] = [];
        let recipient: PValue | undefined;

        // name/label-based recipient detection
        for (const p of inPorts) {
          const vals = byPortVals.get(p.id) ?? [];
          const name = ((p.label || p.id || '') + '').toLowerCase();
          const hinted = HINTS.some((h) => name.includes(h));
          if (hinted && !recipient) {
            recipient = vals[0] ?? { kind: 'undef' };
          }
        }

        // type-based recipient fallback
        if (!recipient) {
          for (const p of inPorts) {
            const vals = byPortVals.get(p.id) ?? [];
            const isAddressPort =
              p.dataType?.kind === 'scalar' && p.dataType.name === 'address';
            if (isAddressPort) {
              recipient = vals[0] ?? { kind: 'undef' };
              break;
            }
          }
        }

        // everything else are objects
        for (const p of inPorts) {
          const vals = byPortVals.get(p.id) ?? [];
          const name = ((p.label || p.id || '') + '').toLowerCase();
          const hinted = HINTS.some((h) => name.includes(h));
          const isAddressPort =
            p.dataType?.kind === 'scalar' && p.dataType.name === 'address';

          if (
            (hinted || isAddressPort) &&
            recipient &&
            vals.length &&
            vals[0] === recipient
          ) {
            continue;
          }
          objects.push(vals[0] ?? ({ kind: 'undef' } as PValue));
        }

        if (!recipient) recipient = { kind: 'undef' };

        ops.push({ kind: 'transferObjects', objects, recipient });
        break;
      }

      case 'makeMoveVec': {
        // align 1:1 with IN ports; any missing -> undef
        const elements = (c.ports || [])
          .filter((p) => p.role === 'io' && p.direction === 'in')
          .map((p) => {
            const vals = byPortVals.get(p.id) ?? [];
            return vals[0] ?? ({ kind: 'undef' } as PValue);
          });

        const out = names.claim('out');
        ops.push({
          kind: 'makeMoveVec',
          elements,
          out,
          elemType: (c.params as any)?.ui?.elemType,
        });
        const outPort = (c.ports || []).find(
          (p) => p.role === 'io' && p.direction === 'out',
        );
        if (outPort) portSyms.set(`${c.id}:${outPort.id}`, [out]);
        break;
      }

      case 'moveCall': {
        const uiAny = (c.params as any)?.ui ?? {};
        const rtAny = (c.params as any)?.runtime ?? {};
        const target =
          rtAny.target ??
          (uiAny.pkgId && uiAny.module && uiAny.func
            ? `${uiAny.pkgId}::${uiAny.module}::${uiAny.func}`
            : '/* pkg::module::function */');

        // Gather args in port order; fill undef if missing
        const inPorts = (c.ports || []).filter(
          (p) => p.role === 'io' && p.direction === 'in',
        );
        const args: PValue[] = inPorts.map((p) => {
          const incoming = byPortVals.get(p.id) ?? [];
          return incoming[0] ?? ({ kind: 'undef' } as PValue);
        });

        // Param kinds strictly from dataType
        const paramKinds: ParamKind[] = inPorts.map((p) =>
          kindFromDataType(p.dataType),
        );

        // Type args from in_targ_* ports (if present)
        const typeArgs: PValue[] = [];
        (c.ports || []).forEach((p) => {
          if (p.role !== 'io' || p.direction !== 'in') return;
          if (String(p.id).startsWith('in_targ_')) {
            const vals = byPortVals.get(p.id) ?? [];
            typeArgs.push(...vals);
          }
        });

        // Return binding policy from OUT ports
        const outs = (c.ports || []).filter(
          (p) => p.role === 'io' && p.direction === 'out',
        );
        let rets:
          | { mode: 'none' }
          | { mode: 'single'; name: string }
          | { mode: 'destructure'; names: string[] };

        if (outs.length === 0) {
          rets = { mode: 'none' };
        } else if (outs.length === 1) {
          const nm = names.claim('result');
          rets = { mode: 'single', name: nm };
          portSyms.set(`${c.id}:${outs[0].id}`, [nm]);
        } else {
          const nms = outs.map((_, i) => names.claim(`result_${i}`));
          rets = { mode: 'destructure', names: nms };
          outs.forEach((p, i) => portSyms.set(`${c.id}:${p.id}`, [nms[i]]));
        }

        ops.push({
          kind: 'moveCall',
          target,
          typeArgs,
          args,
          paramKinds,
          rets,
        });
        break;
      }

      default:
        break;
    }
  }

  return { chain, header, vars, ops };
}
