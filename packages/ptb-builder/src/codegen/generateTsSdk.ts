// src/codegen/generateTsSdk.ts
import type {
  CommandNode,
  PTBEdge,
  PTBGraph,
  PTBNode,
  PTBType,
  VariableNode,
} from '../ptb/graph/types';
import type { Network } from '../types';

/** Detect splitCoins out arity from node ports (single array vs. N singles) */
function splitOutArity(cmd: CommandNode): number {
  const outs = (cmd.ports || []).filter(
    (p) => p.role === 'io' && p.direction === 'out',
  );
  return Math.max(outs.length, 0);
}

/** Simple writer with indentation */
class Writer {
  private lines: string[] = [];
  private indent = 0;
  w(s = '') {
    this.lines.push(`${'  '.repeat(this.indent)}${s}`);
  }
  push() {
    this.indent++;
  }
  pop() {
    this.indent = Math.max(0, this.indent - 1);
  }
  toString() {
    return this.lines.join('\n');
  }
}

/** Unique name allocator to avoid duplicate identifiers */
class NamePool {
  private used = new Set<string>();
  constructor(reserved: string[] = []) {
    reserved.forEach((n) => this.used.add(n));
  }
  claim(baseRaw: string): string {
    const base = (baseRaw || 'val').replace(/[^A-Za-z0-9_]/g, '_') || 'val';
    if (!this.used.has(base)) {
      this.used.add(base);
      return base;
    }
    let i = 2;
    while (this.used.has(`${base}_${i}`)) i++;
    const out = `${base}_${i}`;
    this.used.add(out);
    return out;
  }
}

/** Pluralize a base identifier for vector variables */
function toPluralName(raw: string): string {
  const base = raw || 'val';
  if (
    /(list|array|vec|ids|coins|addresses|objects|values|amounts)$/i.test(base)
  )
    return base;
  const m = base.match(/^val_(\d+)$/i);
  if (m) return `vals_${m[1]}`;
  const lower = base.toLowerCase();
  if (lower.endsWith('y') && !/[aeiou]y$/i.test(base))
    return base.slice(0, -1) + 'ies';
  if (lower.endsWith('s')) return base;
  return base + 's';
}

/** Codegen context flags for header decisions */
type GenCtx = { usedMyAddress: boolean; usedSuiTypeConst: boolean };

/** Heuristics: detect "My Wallet" variable (address for owner/recipient/etc.) */
function isMyWalletVariable(v: VariableNode): boolean {
  if (v.varType?.kind !== 'scalar' || v.varType.name !== 'address')
    return false;
  const name = (v.name || '').toLowerCase();
  return name.includes('wallet') || name === 'myaddress' || name === 'my_addr';
}

/** Special object mappers: gas/system/clock/random → tx.* helpers */
function objectExprFromVariable(v: VariableNode): string {
  const name = (v.name || '').toLowerCase();
  const val = (v as any).value as string | undefined;
  const tag =
    v.varType?.kind === 'object' ? (v.varType.typeTag || '').toLowerCase() : '';
  if (name.includes('gas') || val === 'gas') return 'tx.gas';
  if (name.includes('system') || tag.includes('sui_system'))
    return 'tx.object.system';
  if (name.includes('clock') || tag.endsWith('::clock::clock'))
    return 'tx.object.clock';
  if (name.includes('random') || tag.endsWith('::random::random'))
    return 'tx.object.random';
  return `tx.object('${String(val ?? '')}')`;
}

/** Render VariableNode initializer (with special-cases) */
function renderVariableInit(v: VariableNode, ctx: GenCtx): string {
  const t = v.varType;
  const val = (v as any).value;
  const asStr = (x: unknown) => (typeof x === 'string' ? x : String(x));
  const vec = (elem: PTBType, arr: any[]) => {
    const items = Array.isArray(arr) ? arr : [];
    switch (elem.kind) {
      case 'scalar':
        if (elem.name === 'string' || elem.name === 'address')
          return `[${items.map((s) => `'${String(s)}'`).join(', ')}]`;
        return `[${items.join(', ')}]`;
      case 'move_numeric':
        return `[${items.join(', ')}]`;
      case 'object':
        return `[${items.map((id) => `tx.object('${String(id)}')`).join(', ')}]`;
      default:
        return `[${items.map(asStr).join(', ')}]`;
    }
  };

  switch (t.kind) {
    case 'scalar': {
      if (t.name === 'address') {
        if (isMyWalletVariable(v)) {
          ctx.usedMyAddress = true;
          return 'myAddress';
        }
        return `'${asStr(val ?? '')}'`;
      }
      if (t.name === 'string') return `'${asStr(val ?? '')}'`;
      if (t.name === 'bool') return String(val ?? false);
      if (t.name === 'number') return String(val ?? 0);
      return 'undefined';
    }
    case 'move_numeric':
      return String(val ?? 0);
    case 'object':
      return objectExprFromVariable(v);
    case 'vector':
      return vec(t.elem, Array.isArray(val) ? val : []);
    case 'tuple':
      return `[${(Array.isArray(val) ? val : []).map(asStr).join(', ')}]`;
    default:
      return 'undefined';
  }
}

/** Cast wrapper if edge indicates numeric width */
function applyCastIfAny(expr: string, e?: PTBEdge): string {
  const width = (e as any)?.cast?.to as string | undefined;
  return width ? `tx.pure.${width}(${expr})` : expr;
}

/** ---- Flow helpers ---- */
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
  const seen = new Set<string>();
  const q = [...startIds];
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

/** IO indexes for quick lookup by (targetId,targetPort) and (sourceId,sourcePort) */
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

/** Sanitizes identifiers and falls back if empty */
function safeName(s: string | undefined, fallback: string) {
  const v = (s ?? '').trim().replace(/[^A-Za-z0-9_]/g, '_');
  return v || fallback;
}

/** Array-like detection (vector variables, array literals, typical tx-builders) */
function isArrayLikeExpr(e: string, arrayVarNames: Set<string>): boolean {
  const s = e.trim();
  const looksArrayLiteral = s.startsWith('[') && s.endsWith(']');
  const looksIdentifier = /^[A-Za-z_]\w*$/.test(s);
  const looksMakeVec = s.startsWith('tx.makeMoveVec(');
  const looksSplitCoins = s.startsWith('tx.splitCoins(');
  return (
    looksArrayLiteral ||
    looksMakeVec ||
    looksSplitCoins ||
    (looksIdentifier && arrayVarNames.has(s))
  );
}

/** amounts builder for splitCoins: always pass an array argument */
function amountsExprForSplit(
  raw: string[],
  arrayVarNames: Set<string>,
): string {
  if (raw.length === 1) {
    const e = raw[0].trim();
    if (isArrayLikeExpr(e, arrayVarNames)) return e; // vector variable / array literal
  }
  if (raw.length === 0) return '[]';
  return `[${raw.join(', ')}]`; // wrap scalars
}

/** Flatten into a single array literal (no spreads at call-sites) */
function emitArrayArgFlat(exprs: string[], arrayVarNames: Set<string>): string {
  if (exprs.length === 0) return '[]';
  if (exprs.length === 1) {
    const e = exprs[0].trim();
    if (isArrayLikeExpr(e, arrayVarNames)) return e;
  }
  return `[${exprs.join(', ')}]`;
}

/** Identify transferObjects inputs robustly */
function pickTransferInputs(
  cmd: CommandNode,
  byPort: Map<string, string[]>,
): { objectsExprs: string[]; recipientExpr?: string } {
  const objectsExprs: string[] = [];
  let recipientExpr: string | undefined;
  for (const p of cmd.ports || []) {
    if (p.role !== 'io' || p.direction !== 'in') continue;
    const vals = byPort.get(p.id) ?? [];
    if (p.label === 'objects') {
      objectsExprs.push(...vals);
      continue;
    }
    if (p.label === 'recipient') {
      if (!recipientExpr && vals.length) recipientExpr = vals[0];
      continue;
    }
    const t = p.dataType;
    if (t?.kind === 'scalar' && t.name === 'address') {
      if (!recipientExpr && vals.length) recipientExpr = vals[0];
    } else {
      objectsExprs.push(...vals);
    }
  }
  return { objectsExprs, recipientExpr };
}

/** Helper: did we include a "my wallet" address variable? */
function isMyWalletInGraph(
  usedVarIds: Set<string>,
  idToNode: Map<string, PTBNode>,
): boolean {
  for (const id of usedVarIds) {
    const n = idToNode.get(id);
    if (n?.kind === 'Variable' && isMyWalletVariable(n as VariableNode))
      return true;
  }
  return false;
}

/** ==== MAIN: Generate ts-sdk code (commands only on Start→…→End paths) ==== */
export function generateTsSdkCode(graph: PTBGraph, network: Network): string {
  const header = new Writer();
  const vars = new Writer();
  const body = new Writer();
  const ctx: GenCtx = { usedMyAddress: false, usedSuiTypeConst: false };
  const names = new NamePool(['tx', 'myAddress', 'SUI']);

  // Flow + indexes
  const activeIds = activeFlowIds(graph);
  const orderedActive = orderActive(graph, activeIds);
  const idToNode = new Map(graph.nodes.map((n) => [n.id, n]));
  const { byTarget, ioEdges } = buildIoIndex(graph.edges);

  // Variables that feed active commands
  const usedVarIds = new Set<string>();
  for (const e of ioEdges) {
    if (!activeIds.has(e.target)) continue;
    const src = idToNode.get(e.source);
    if (src?.kind === 'Variable') usedVarIds.add(src.id);
  }

  // Track names that are arrays (vector variables or array-producing command results)
  const arrayVarNames = new Set<string>();

  // Wire expressions and per-port element lists (for destructured results)
  const portExpr = new Map<string, string>();
  const portElems = new Map<string, string[]>();

  /** Collect inputs; flatten element lists when available */
  function collectInputs(
    node: PTBNode,
    ioByTarget: Map<string, Map<string, PTBEdge[]>>,
  ) {
    const byLabel = new Map<string, string[]>();
    const byPort = new Map<string, string[]>();
    const ports = (node.ports || []).filter(
      (p) => p.direction === 'in' && p.role === 'io',
    );
    for (const p of ports) {
      const edges = ioByTarget.get(node.id)?.get(p.id) ?? [];
      const arr: string[] = [];
      for (const e of edges) {
        const key = `${e.source}:${e.sourcePort}`;
        const elems = portElems.get(key);
        if (elems && elems.length)
          arr.push(...elems.map((x) => applyCastIfAny(x, e)));
        else {
          const expr = portExpr.get(key) ?? 'undefined';
          arr.push(applyCastIfAny(expr, e));
        }
      }
      byPort.set(p.id, arr);
      if (p.label) byLabel.set(p.label, arr);
    }
    return { byLabel, byPort };
  }

  /** Register outputs into portExpr / portElems (fixed per-port mapping) */
  function registerOutputs(
    node: PTBNode,
    callExpr: string,
    overrideNames?: string[], // if provided
  ) {
    const outs = (node.ports || []).filter(
      (p) => p.direction === 'out' && p.role === 'io',
    );

    // Case A: multiple out ports (single×N) → map element-by-element
    if (outs.length > 1) {
      const names = (overrideNames ?? []).slice(0, outs.length);
      // If not enough names were provided, fall back to callExpr (rare)
      outs.forEach((p, i) => {
        const key = `${node.id}:${p.id}`;
        const name = names[i];
        if (name) {
          // Single element per port
          portExpr.set(key, name);
          // IMPORTANT: do NOT set portElems here (prevents flattening to all)
        } else {
          // Fallback
          portExpr.set(key, callExpr);
        }
      });
      return;
    }

    // Case B: single out port
    const only = outs[0];
    if (!only) return;

    const key = `${node.id}:${only.id}`;
    if (overrideNames && overrideNames.length > 1) {
      // Single port but multiple logical elements → treat as a vector
      portExpr.set(key, `[${overrideNames.join(', ')}]`);
      portElems.set(key, [...overrideNames]);
    } else if (overrideNames && overrideNames.length === 1) {
      // Single port with a single name
      portExpr.set(key, overrideNames[0]);
    } else {
      // No overrides: just the call expr
      portExpr.set(key, callExpr);
    }
  }

  /** Vector<T> type printer (SUI → const SUI) */
  function typeExprForVec(elemType: PTBType | undefined): string {
    if (!elemType) return `'/* T */'`;
    switch (elemType.kind) {
      case 'move_numeric':
        return `'${elemType.width}'`;
      case 'scalar':
        return `'${elemType.name}'`;
      case 'object': {
        const tag = elemType.typeTag || '';
        if (!tag) return `'/* object */'`;
        const low = tag.toLowerCase();
        if (low === '0x2::sui::sui') {
          ctx.usedSuiTypeConst = true;
          return 'SUI';
        }
        return `'${tag}'`;
      }
      default:
        return `'/* unsupported */'`;
    }
  }

  // === Variables (only those actually used) ===
  let varAuto = 1;
  for (const n of graph.nodes) {
    if (!usedVarIds.has(n.id)) continue;
    const v = n as VariableNode;

    let base = safeName(v.name, `val_${varAuto++}`);
    if (v.varType?.kind === 'vector') base = toPluralName(base);
    const varName = names.claim(base);

    const init = renderVariableInit(v, ctx);
    vars.w(`const ${varName} = ${init};`);

    if (v.varType?.kind === 'vector') arrayVarNames.add(varName);

    for (const p of v.ports || []) {
      if (p.role === 'io' && p.direction === 'out') {
        portExpr.set(`${v.id}:${p.id}`, varName);
      }
    }
  }
  if (varAuto > 1) vars.w('');

  // === Commands (only those on active flow) ===
  let splitCmdSeq = 0; // for cmd_<seq>_<i> naming
  for (const n of orderedActive) {
    if (n.kind !== 'Command') continue;
    const c = n as CommandNode;

    const { byLabel, byPort } = collectInputs(c, byTarget);

    // Named outputs (if any)
    const declaredOuts =
      c.outputs && c.outputs.length > 0
        ? c.outputs.map((s) => safeName(s, s))
        : [];
    const uniqueOuts = declaredOuts.map((o) => names.claim(o));

    const assignPrefix =
      uniqueOuts.length > 1
        ? `const [${uniqueOuts.join(', ')}] = `
        : uniqueOuts.length === 1
          ? `const ${uniqueOuts[0]} = `
          : ``;

    switch (c.command) {
      case 'splitCoins': {
        splitCmdSeq += 1;

        // Inputs
        const coin = byLabel.get('coin') ?? byPort.values().next().value ?? [];
        const rawAmounts =
          byLabel.get('amounts') ?? [...byPort.values()].slice(1).flat();
        const coinExpr = coin[0] ?? '/* coin */ tx.gas';

        // amounts: always array for ts-sdk
        const amountsExpr = amountsExprForSplit(rawAmounts, arrayVarNames);

        // Output mode by actual out ports
        const outArity = splitOutArity(c);

        if (outArity > 1) {
          // Single×N elements → destructure; use cmd_<seq>_<i> schema where needed
          const elemNames: string[] =
            uniqueOuts.length >= outArity
              ? uniqueOuts.slice(0, outArity)
              : [
                  ...uniqueOuts,
                  ...Array.from(
                    { length: outArity - uniqueOuts.length },
                    (_, i) => names.claim(`cmd_${splitCmdSeq}_${i}`),
                  ),
                ];

          body.w(
            `const [${elemNames.join(', ')}] = tx.splitCoins(${coinExpr}, ${amountsExpr});`,
          );
          registerOutputs(c, `[${elemNames.join(', ')}]`, elemNames);
          break;
        }

        // Default (single array output)
        const arrName =
          uniqueOuts.length === 1 ? uniqueOuts[0] : names.claim('coins');
        body.w(
          `const ${arrName} = tx.splitCoins(${coinExpr}, ${amountsExpr});`,
        );
        arrayVarNames.add(arrName);
        registerOutputs(c, arrName);
        break;
      }

      case 'mergeCoins': {
        const dest =
          byLabel.get('destination') ?? byPort.values().next().value ?? [];
        const sources =
          byLabel.get('sources') ?? [...byPort.values()].slice(1).flat();
        const destExpr = dest[0] ?? '/* dest */ tx.gas';
        const srcExpr = emitArrayArgFlat(sources, arrayVarNames);
        const call = `tx.mergeCoins(${destExpr}, ${srcExpr})`;

        if (assignPrefix) {
          body.w(`${assignPrefix}${call};`);
          registerOutputs(
            c,
            uniqueOuts.length === 1 ? uniqueOuts[0] : call,
            uniqueOuts,
          );
        } else {
          body.w(`${call};`);
          registerOutputs(c, call);
        }
        break;
      }

      case 'transferObjects': {
        const { objectsExprs, recipientExpr } = pickTransferInputs(c, byPort);
        const objsExpr = emitArrayArgFlat(objectsExprs, arrayVarNames);
        const rcpt =
          recipientExpr ??
          (isMyWalletInGraph(usedVarIds, idToNode)
            ? 'myAddress'
            : `'/* recipient */ 0x...'`);
        const call = `tx.transferObjects(${objsExpr}, ${rcpt})`;

        if (assignPrefix) {
          body.w(`${assignPrefix}${call};`);
          registerOutputs(
            c,
            uniqueOuts.length === 1 ? uniqueOuts[0] : call,
            uniqueOuts,
          );
        } else {
          body.w(`${call};`);
          registerOutputs(c, call);
        }
        break;
      }

      case 'makeMoveVec': {
        const elems =
          byLabel.get('elems') ??
          byLabel.get('elements') ??
          [...byPort.values()].flat();
        const elemType = (c.params as any)?.ui?.elemType as PTBType | undefined;
        const typeExpr = typeExprForVec(elemType);
        const elemsExpr = emitArrayArgFlat(elems, arrayVarNames);
        const call = `tx.makeMoveVec({ type: ${typeExpr}, elements: ${elemsExpr} })`;

        if (assignPrefix) {
          body.w(`${assignPrefix}${call};`);
          uniqueOuts.forEach((n) => arrayVarNames.add(n));
          registerOutputs(
            c,
            uniqueOuts.length === 1 ? uniqueOuts[0] : call,
            uniqueOuts,
          );
        } else {
          const tmp = names.claim('vec');
          body.w(`const ${tmp} = ${call};`);
          arrayVarNames.add(tmp);
          registerOutputs(c, tmp);
        }
        break;
      }

      case 'moveCall': {
        const runtime = (c.params as any)?.runtime ?? {};
        const target = runtime.target ?? '/* pkg::module::function */';
        const targs: string[] = [];
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
            targs.push(ts);
          } else {
            for (const e of incoming) args.push(e);
          }
        }
        const fields: string[] = [`target: '${target}'`];
        if (targs.length) fields.push(`typeArguments: [${targs.join(', ')}]`);
        if (args.length) fields.push(`arguments: [${args.join(', ')}]`);
        const call = `tx.moveCall({ ${fields.join(', ')} })`;

        if (assignPrefix) {
          body.w(`${assignPrefix}${call};`);
          registerOutputs(
            c,
            uniqueOuts.length === 1 ? uniqueOuts[0] : call,
            uniqueOuts,
          );
        } else {
          const tmp = names.claim('cmd');
          body.w(`const ${tmp} = ${call};`);
          registerOutputs(c, tmp);
        }
        break;
      }

      default:
        body.w(`// TODO: implement '${c.command}' codegen`);
        break;
    }
  }

  // === Header ===
  const out = new Writer();
  out.w(`// Auto-generated from PTB graph (network: ${network})`);
  out.w(`import { Transaction } from '@mysten/sui/transactions';`);
  if (ctx.usedSuiTypeConst) out.w(`const SUI = '0x2::sui::SUI';`);
  out.w('');
  if (ctx.usedMyAddress) {
    out.w(`// Inject your wallet address here (or via an adapter):`);
    out.w(`// const myAddress = '0x...';`);
  }
  out.w(`const tx = new Transaction();`);
  out.w(
    ctx.usedMyAddress
      ? `// tx.setSenderIfNotSet(myAddress);`
      : `// tx.setSenderIfNotSet('<your-address>');`,
  );
  out.w(`// tx.setGasBudgetIfNotSet(500_000_000);`);

  const varsStr = vars.toString().trim();
  const bodyStr = body.toString().trim();

  if (!varsStr && !bodyStr) {
    out.w('');
    out.w('// No generated steps yet.');
    out.w(
      '// Create nodes and wire variables (Start → … → End) to see code here.',
    );
    out.w(
      '// For example, add a MoveCall or SplitCoins node and connect inputs/outputs.',
    );
  } else {
    if (varsStr) out.w(varsStr);
    if (bodyStr) out.w(bodyStr);
  }

  out.w('');
  out.w('export { tx };');
  return out.toString();
}
