// src/codegen/preprocess.ts

import {
  type CommandNode,
  parseHandleTypeSuffix,
  type PTBGraph,
  type PTBNode,
  type VariableNode,
} from '../ptb/graph/types';
import type { Chain } from '../types';
import { POp, Program, PValue, PVar } from './types';

// --- Shared helpers (graph-only; no tx/code awareness) ---
const PLURAL = (base: string) =>
  /(list|array|vec|ids|coins|addresses|objects|values|amounts)$/i.test(base)
    ? base
    : base.toLowerCase().endsWith('y') && !/[aeiou]y$/i.test(base)
      ? base.slice(0, -1) + 'ies'
      : base.toLowerCase().endsWith('s')
        ? base
        : base + 's';

// Reserved identifiers and words we should not emit verbatim
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
    RESERVED.forEach((n) => this.used.add(n)); // avoid claiming exact reserved names
  }
  claim(raw: string) {
    // sanitize
    let base = (raw || 'val').replace(/[^A-Za-z0-9_]/g, '_') || 'val';

    // avoid reserved exact match by suffixing _id
    if (RESERVED.has(base)) base = `${base}_id`;

    // enforce numbered style: ensure trailing _\d+ always exists
    if (!/_\d+$/.test(base)) base = `${base}_0`;

    // allocate unique by bumping the trailing number
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
  // start first
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

// ---- variable & value builders (no tx, no code) ----
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
  if (!t) return { kind: 'scalar', value: '' };
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
      return { kind: 'scalar', value: '' };
    case 'move_numeric':
      return { kind: 'move_numeric', value: Number(val ?? 0) };
    case 'object': {
      const name = (v.name || '').toLowerCase();
      let tag = '';
      if (t.kind === 'object') {
        tag = (t.typeTag ?? '').toLowerCase();
      }
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
      return { kind: 'scalar', value: '' };
  }
}

export function preprocess(graph: PTBGraph, chain: Chain): Program {
  const header = { usedMyAddress: false, usedSuiTypeConst: false };

  const active = activeFlowIds(graph);
  const ordered = orderActive(graph, active);
  const idToNode = new Map(graph.nodes.map((n) => [n.id, n]));
  const { byTarget, ioEdges } = buildIoIndex(graph.edges);

  // variables used by active commands
  const usedVarIds = new Set<string>();
  for (const e of ioEdges) {
    if (!active.has(e.target)) continue;
    const src = idToNode.get(e.source);
    if (src?.kind === 'Variable') usedVarIds.add(src.id);
  }

  // symbol map for OUT ports
  const portSyms = new Map<string, string[]>(); // `${nodeId}:${portId}` -> string[]

  const vars: PVar[] = [];
  const names = new NamePool(['tx', 'SUI', 'myAddress']);

  // emit variables
  let varAuto = 1;
  for (const n of graph.nodes) {
    if (!usedVarIds.has(n.id)) continue;
    const v = n as VariableNode;

    let base = (v.name || '').trim() || `val_${varAuto++}`;
    if (v.varType?.kind === 'vector') base = PLURAL(base);
    const sym = names.claim(base);

    const init = toPValueFromVar(v);
    if (init.kind === 'scalar' && init.value === 'myAddress')
      header.usedMyAddress = true;

    vars.push({ name: sym, init });

    for (const p of v.ports || []) {
      if (p.role === 'io' && p.direction === 'out') {
        portSyms.set(`${v.id}:${p.id}`, [sym]);
      }
    }
  }

  // helper: collect IN-port inputs as symbol refs or literals
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
        const coin = (inPorts.length
          ? (byPortVals.get(inPorts[0].id) ?? [])
          : [])[0] ?? { kind: 'object', special: 'gas' };
        let amounts: PValue[] = [];
        const grouped = (c.ports || []).find(
          (p) =>
            p.role === 'io' &&
            p.direction === 'in' &&
            (p.label === 'amounts' ||
              p.id === 'amounts' ||
              p.id.startsWith('in_amount_')),
        )?.id;
        if (grouped) {
          amounts = byPortVals.get(grouped) ?? [];
          if (!amounts.length && inPorts.length > 1) {
            amounts = inPorts
              .slice(1)
              .flatMap((p) => byPortVals.get(p.id) ?? []);
          }
        } else {
          amounts = inPorts.slice(1).flatMap((p) => byPortVals.get(p.id) ?? []);
        }

        const outs = (c.ports || []).filter(
          (p) => p.role === 'io' && p.direction === 'out',
        );
        if (outs.length > 1) {
          const namesOut = outs.map((_, i) =>
            names.claim(`out_${splitSeq}_${i}`),
          );
          ops.push({
            kind: 'splitCoins',
            coin,
            amounts,
            out: { mode: 'destructure', names: namesOut },
          });
          outs.forEach((p, i) =>
            portSyms.set(`${c.id}:${p.id}`, [namesOut[i]]),
          );
        } else {
          const arrName = names.claim('out');
          ops.push({
            kind: 'splitCoins',
            coin,
            amounts,
            out: { mode: 'vector', name: arrName },
          });
          const out0 = (c.ports || []).find(
            (p) => p.role === 'io' && p.direction === 'out',
          );
          if (out0) portSyms.set(`${c.id}:${out0.id}`, [arrName]);
        }
        break;
      }

      case 'mergeCoins': {
        const inPorts = (c.ports || []).filter(
          (p) => p.role === 'io' && p.direction === 'in',
        );
        const destination = (inPorts.length
          ? (byPortVals.get(inPorts[0].id) ?? [])
          : [])[0] ?? { kind: 'object', special: 'gas' };
        const sources = inPorts
          .slice(1)
          .flatMap((p) => byPortVals.get(p.id) ?? []);
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

        // 1) Name/label-based detection first
        for (const p of inPorts) {
          const vals = byPortVals.get(p.id) ?? [];
          const name = ((p.label || p.id || '') + '').toLowerCase();
          const hinted = HINTS.some((h) => name.includes(h));
          if (hinted && !recipient && vals.length) {
            recipient = vals[0];
            continue;
          }
        }

        // 2) Type-based (address-typed IN port)
        if (!recipient) {
          for (const p of inPorts) {
            const vals = byPortVals.get(p.id) ?? [];
            const isAddressPort =
              p.dataType?.kind === 'scalar' && p.dataType.name === 'address';
            if (isAddressPort && !recipient && vals.length) {
              recipient = vals[0];
              break;
            }
          }
        }

        // 3) Everything not the recipient is objects
        for (const p of inPorts) {
          const vals = byPortVals.get(p.id) ?? [];
          const name = ((p.label || p.id || '') + '').toLowerCase();
          const hinted = HINTS.some((h) => name.includes(h));
          const isAddressPort =
            p.dataType?.kind === 'scalar' && p.dataType.name === 'address';

          // skip the one we already took as recipient
          if (
            (hinted || isAddressPort) &&
            recipient &&
            vals.length &&
            vals[0] === recipient
          ) {
            continue;
          }
          objects.push(...vals);
        }

        // 4) Fallback to myAddress sentinel only if still missing
        if (!recipient) {
          recipient = { kind: 'scalar', value: 'myAddress' };
          header.usedMyAddress = true;
        }

        ops.push({ kind: 'transferObjects', objects, recipient });
        break;
      }

      case 'makeMoveVec': {
        const elements = (c.ports || [])
          .filter((p) => p.role === 'io' && p.direction === 'in')
          .flatMap((p) => byPortVals.get(p.id) ?? []);
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

        const typeArgs: PValue[] = [];
        const args: PValue[] = [];
        for (const p of c.ports || []) {
          if (p.role !== 'io' || p.direction !== 'in') continue;
          const incoming = byPortVals.get(p.id) ?? [];
          if (p.id.startsWith('in_targ_')) typeArgs.push(...incoming);
          else args.push(...incoming);
        }
        ops.push({ kind: 'moveCall', target, typeArgs, args });
        break;
      }

      default:
        // ignore
        break;
    }
  }

  return { chain, header, vars, ops };
}
