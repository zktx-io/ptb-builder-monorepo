// PTB Graph → IR
// Assigns stable symbols per variable and per command output, including splitCoins single×N.
// The same IR is consumed by codegen and runtime builder.

import { isTypeCompatible, isUnknownType } from '../ptb/graph/typecheck';
import type {
  CommandNode,
  PTBEdge,
  PTBGraph,
  PTBNode,
  PTBType,
  VariableNode,
} from '../ptb/graph/types';
import type { Network } from '../types';
import type {
  IR,
  IRHeader,
  IRInit,
  IROp,
  IROpSplitCoins,
  IROutDestructure,
  IROutVector,
  IRVar,
} from './types';

// ---------- flow helpers (same as codegen’s logic) ----------
function flowAdj(graph: PTBGraph) {
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
function reach(startIds: string[], adj: Map<string, string[]>) {
  const seen = new Set<string>(),
    q = [...startIds];
  while (q.length) {
    const id = q.shift()!;
    if (seen.has(id)) continue;
    seen.add(id);
    for (const t of adj.get(id) ?? []) if (!seen.has(t)) q.push(t);
  }
  return seen;
}
function activeFlowIds(graph: PTBGraph): Set<string> {
  const starts = graph.nodes.filter((n) => n.kind === 'Start').map((n) => n.id);
  const ends = graph.nodes.filter((n) => n.kind === 'End').map((n) => n.id);
  const { fwd, rev } = flowAdj(graph);
  const fromStart = reach(starts, fwd),
    toEnd = reach(ends, rev);
  const active = new Set<string>();
  for (const id of fromStart) if (toEnd.has(id)) active.add(id);
  return active;
}
function orderActive(graph: PTBGraph, active: Set<string>): PTBNode[] {
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

// ---------- IO index ----------
function buildIoIndex(edges: PTBEdge[]) {
  const io = edges.filter((e) => e.kind === 'io');
  const byTarget = new Map<string, Map<string, PTBEdge[]>>();
  const bySource = new Map<string, Map<string, PTBEdge[]>>();
  for (const e of io) {
    if (!byTarget.has(e.target)) byTarget.set(e.target, new Map());
    if (!bySource.has(e.source)) bySource.set(e.source, new Map());
    const mt = byTarget.get(e.target)!,
      ms = bySource.get(e.source)!;
    mt.set(e.targetPort, [...(mt.get(e.targetPort) ?? []), e]);
    ms.set(e.sourcePort, [...(ms.get(e.sourcePort) ?? []), e]);
  }
  return { byTarget, bySource, ioEdges: io };
}

// ---------- utils ----------
const SAFE = (s: string, fb: string) =>
  (s ?? '').trim().replace(/[^A-Za-z0-9_]/g, '_') || fb;
const PLURAL = (base: string) => {
  if (
    /(list|array|vec|ids|coins|addresses|objects|values|amounts)$/i.test(base)
  )
    return base;
  const lower = base.toLowerCase();
  if (lower.endsWith('y') && !/[aeiou]y$/i.test(base))
    return base.slice(0, -1) + 'ies';
  if (lower.endsWith('s')) return base;
  return base + 's';
};

function splitOutArity(cmd: CommandNode): number {
  const outs = (cmd.ports || []).filter(
    (p) => p.role === 'io' && p.direction === 'out',
  );
  return Math.max(outs.length, 0);
}

function isMyWalletVariable(v: VariableNode): boolean {
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

function objectInitFromVar(v: VariableNode): IRInit {
  const name = (v.name || '').toLowerCase();
  const val = (v as any).value as string | undefined;
  const tag =
    v.varType?.kind === 'object' ? (v.varType.typeTag || '').toLowerCase() : '';

  if (name.includes('gas') || val === 'gas')
    return { kind: 'object', special: 'gas' };
  if (name.includes('system') || tag.includes('sui_system'))
    return { kind: 'object', special: 'system' };
  if (name.includes('clock') || tag.endsWith('::clock::clock'))
    return { kind: 'object', special: 'clock' };
  if (name.includes('random') || tag.endsWith('::random::random'))
    return { kind: 'object', special: 'random' };
  return { kind: 'object', id: String(val ?? '') };
}

function initFromVar(v: VariableNode): IRInit {
  const t = v.varType;
  const val = (v as any).value;
  if (!t) return { kind: 'scalar', value: '' };

  switch (t.kind) {
    case 'scalar': {
      if (t.name === 'address') {
        if (isMyWalletVariable(v))
          return { kind: 'scalar', value: 'myAddress' }; // sentinel
        return { kind: 'scalar', value: String(val ?? '') };
      }
      if (t.name === 'string')
        return { kind: 'scalar', value: String(val ?? '') };
      if (t.name === 'bool')
        return { kind: 'scalar', value: Boolean(val ?? false) };
      if (t.name === 'number')
        return { kind: 'move_numeric', value: Number(val ?? 0) };
      return { kind: 'scalar', value: '' };
    }
    case 'move_numeric':
      return { kind: 'move_numeric', value: Number(val ?? 0) };
    case 'object':
      return objectInitFromVar(v);
    case 'vector': {
      const items = Array.isArray(val) ? val : [];
      // element init is best-effort; builder wraps numeric/address at call-sites
      const elem: IRInit[] = items.map((x) => {
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
      });
      return { kind: 'vector', items: elem };
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

// ---------- main ----------
export function preprocessToIR(graph: PTBGraph, network: Network): IR {
  const header: IRHeader = { usedMyAddress: false, usedSuiTypeConst: false };

  // Active subgraph
  const active = activeFlowIds(graph);
  const ordered = orderActive(graph, active);
  const idToNode = new Map(graph.nodes.map((n) => [n.id, n]));
  const { byTarget } = buildIoIndex(graph.edges);

  // Registry: for each OUT port → array of symbols exposed by that port
  const portSyms = new Map<string, string[]>(); // `${nodeId}:${portId}` -> symbols

  // Vars to emit
  const irVars: IRVar[] = [];
  const usedVarIds = new Set<string>();
  for (const e of graph.edges) {
    if (e.kind !== 'io') continue;
    if (!active.has(e.target)) continue;
    const srcNode = idToNode.get(e.source);
    if (srcNode?.kind === 'Variable') usedVarIds.add(srcNode.id);
  }

  // Emit variables used by active commands and map their OUT port to symbol(s)
  let varAuto = 1;
  for (const n of graph.nodes) {
    if (!usedVarIds.has(n.id)) continue;
    const v = n as VariableNode;

    let base = SAFE(v.name || '', `val_${varAuto++}`);
    if (v.varType?.kind === 'vector') base = PLURAL(base);
    const sym = base;

    const init = initFromVar(v);
    if (
      (init.kind === 'scalar' && init.value === 'myAddress') ||
      (v.varType?.kind === 'scalar' &&
        v.varType.name === 'address' &&
        isMyWalletVariable(v))
    ) {
      header.usedMyAddress = true;
    }
    irVars.push({ name: sym, init });

    // map all OUT io ports to this symbol (vector var still exposes one symbol)
    for (const p of v.ports || []) {
      if (p.role === 'io' && p.direction === 'out') {
        portSyms.set(`${v.id}:${p.id}`, [sym]);
      }
    }
  }

  const irOps: IROp[] = [];
  let splitSeq = 0;

  // Helper: gather inputs for a node's IN ports as arrays of symbols
  function collect(node: PTBNode) {
    const byPort = new Map<string, string[]>();
    const ports = (node.ports || []).filter(
      (p) => p.role === 'io' && p.direction === 'in',
    );
    for (const p of ports) {
      const edges = byTarget.get(node.id)?.get(p.id) ?? [];
      const arr: string[] = [];
      for (const e of edges) {
        const key = `${e.source}:${e.sourcePort}`;
        const syms = portSyms.get(key) ?? [];
        if (syms.length) arr.push(...syms);
      }
      byPort.set(p.id, arr);
    }
    return byPort;
  }

  // For each active command in flow order
  for (const node of ordered) {
    if (node.kind !== 'Command') continue;
    const c = node as CommandNode;
    const byPort = collect(c);

    switch (c.command) {
      case 'splitCoins': {
        splitSeq += 1;

        // coin: first IN port values
        const inPorts = (c.ports || []).filter(
          (p) => p.role === 'io' && p.direction === 'in',
        );
        const coinSyms = inPorts.length
          ? (byPort.get(inPorts[0].id) ?? [])
          : [];
        const coin = coinSyms[0] ?? 'tx.gas'; // fallback is tx.gas-like, but builder will receive env symbol normally

        // amounts: rest inputs (or label==amounts in your schema)
        const amountsPort = (c.ports || []).find(
          (p) =>
            p.role === 'io' && p.direction === 'in' && p.label === 'amounts',
        )?.id;
        let rawAmounts: string[] = [];
        if (amountsPort) rawAmounts = byPort.get(amountsPort) ?? [];
        else {
          // if no explicit label, concatenate remaining ports (except coin)
          const restPorts = inPorts.slice(1);
          rawAmounts = restPorts.flatMap((p) => byPort.get(p.id) ?? []);
        }

        // output arity by real out IO port count
        const outs = (c.ports || []).filter(
          (p) => p.role === 'io' && p.direction === 'out',
        );
        const arity = Math.max(outs.length, 0);

        if (arity > 1) {
          // single×N: generate stable names cmd_<seq>_<i> unless user named outs
          const names: string[] = outs.map((_, i) => `cmd_${splitSeq}_${i}`);
          const op: IROpSplitCoins = {
            kind: 'splitCoins',
            coin,
            amounts: rawAmounts,
            out: { mode: 'destructure', names } as IROutDestructure,
          };
          irOps.push(op);

          // register port symbols element-by-element
          outs.forEach((p, i) => {
            portSyms.set(`${c.id}:${p.id}`, [names[i]]);
          });
        } else {
          // single vector out
          const arrName = 'coins';
          const op: IROpSplitCoins = {
            kind: 'splitCoins',
            coin,
            amounts: rawAmounts,
            out: { mode: 'vector', name: arrName } as IROutVector,
          };
          irOps.push(op);

          if (outs[0]) {
            portSyms.set(`${c.id}:${outs[0].id}`, [arrName]);
          }
        }
        break;
      }

      case 'mergeCoins': {
        const inPorts = (c.ports || []).filter(
          (p) => p.role === 'io' && p.direction === 'in',
        );
        const destSyms = inPorts.length
          ? (byPort.get(inPorts[0].id) ?? [])
          : [];
        const destination = destSyms[0] ?? 'tx.gas';
        const sources = inPorts.slice(1).flatMap((p) => byPort.get(p.id) ?? []);

        irOps.push({ kind: 'mergeCoins', destination, sources });
        break;
      }

      case 'transferObjects': {
        // objects + recipient; accept label-based or positional
        const inPorts = (c.ports || []).filter(
          (p) => p.role === 'io' && p.direction === 'in',
        );

        // Guess recipient: find a scalar<address> input port if labeled or last by shape
        let recipient: string | undefined;
        const objects: string[] = [];

        for (const p of inPorts) {
          const t = p.dataType;
          const vals = byPort.get(p.id) ?? [];
          if (t?.kind === 'scalar' && t.name === 'address') {
            if (!recipient && vals.length) recipient = vals[0];
          } else {
            objects.push(...vals);
          }
        }

        if (!recipient) {
          // allow fallback to myAddress sentinel; builder will wrap via tx.pure.address(...)
          recipient = 'myAddress';
        }

        // mark header if we used myAddress sentinel
        if (recipient === 'myAddress') header.usedMyAddress = true;

        irOps.push({ kind: 'transferObjects', objects, recipient });
        break;
      }

      case 'makeMoveVec': {
        // collect all inputs as elements
        const elems = (c.ports || [])
          .filter((p) => p.role === 'io' && p.direction === 'in')
          .flatMap((p) => byPort.get(p.id) ?? []);
        const outPort = (c.ports || []).find(
          (p) => p.role === 'io' && p.direction === 'out',
        );
        const outSym = 'vec';

        irOps.push({
          kind: 'makeMoveVec',
          elements: elems,
          out: outSym,
          elemType: (c.params as any)?.ui?.elemType as PTBType | undefined,
        });

        if (outPort) portSyms.set(`${c.id}:${outPort.id}`, [outSym]);
        break;
      }

      case 'moveCall': {
        // Simple pass-through (positional args)
        const target =
          (c.params as any)?.runtime?.target ?? '0x1::module::func';
        const typeArgs: string[] = [];
        const args: string[] = [];

        for (const p of c.ports || []) {
          if (p.role !== 'io' || p.direction !== 'in') continue;
          const incoming = byPort.get(p.id) ?? [];
          if ((p.dataType?.kind ?? '') === 'typeparam') {
            const ts =
              p.typeStr ||
              (p.dataType?.kind === 'typeparam'
                ? p.dataType.name
                : undefined) ||
              '/* T */';
            typeArgs.push(ts);
          } else {
            args.push(...incoming);
          }
        }

        irOps.push({ kind: 'moveCall', target, typeArgs, args });
        break;
      }

      default:
        // unsupported commands are skipped
        break;
    }
  }

  return {
    network,
    header,
    vars: irVars,
    ops: irOps,
  };
}
