// src/codegen/generateTsSdkCode.ts
// IR -> TypeScript SDK source string (preview-only)
// Reuses graph helpers exported by preprocess.ts to avoid duplication.
// Does NOT rely on PTBEdge.dataType; per-port PTBType is the SSOT.

import type {
  CommandNode,
  PTBEdge,
  PTBGraph,
  PTBNode,
  PTBType,
  VariableNode,
} from '../ptb/graph/types';
import type { Chain } from '../types';
import {
  activeFlowIds,
  basePortId,
  buildIoIndex,
  orderActive,
} from './preprocess';
import type { ExecOptions } from './types';

/** Detect splitCoins out arity based on OUT ports (array vs single×N). */
function splitOutArity(cmd: CommandNode): number {
  const outs = (cmd.ports || []).filter(
    (p) => p.role === 'io' && p.direction === 'out',
  );
  return Math.max(outs.length, 0);
}

/** Simple writer with indentation. */
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

/** Unique name allocator to avoid duplicate identifiers. */
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

/** Pluralize a base identifier for vector variables. */
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

/** Codegen context flags for header decisions. */
type GenCtx = { usedMyAddress: boolean; usedSuiTypeConst: boolean };

/** Heuristics: detect "My Wallet" variable (address for owner/recipient/etc.). */
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

/** Special object mappers: gas/system/clock/random → tx.* helpers. */
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

/** Render VariableNode initializer (never returns undefined). */
function renderVariableInit(v: VariableNode, ctx: GenCtx): string {
  const t = v.varType;
  const val = (v as any).value;

  const asStr = (x: unknown) => (typeof x === 'string' ? x : String(x));
  const vec = (elem: PTBType | undefined, arr: any[]) => {
    const items = Array.isArray(arr) ? arr : [];
    const mapItem = (x: any) => {
      if (!elem) return asStr(x);
      switch (elem.kind) {
        case 'scalar':
          if (elem.name === 'string' || elem.name === 'address')
            return `'${String(x)}'`;
          if (elem.name === 'bool') return String(Boolean(x));
          return String(x);
        case 'move_numeric':
          return String(x ?? 0);
        case 'object':
          return `tx.object('${String(x ?? '')}')`;
        default:
          return asStr(x);
      }
    };
    return `[${items.map(mapItem).join(', ')}]`;
  };

  if (!t) return `''`;

  switch (t.kind) {
    case 'scalar': {
      if (t.name === 'address') {
        if (isMyWalletVariable(v)) {
          ctx.usedMyAddress = true;
          return 'myAddress';
        }
        const s = (val ?? '').toString();
        return s ? `'${s}'` : `'0x...'`;
      }
      if (t.name === 'string') return `'${asStr(val ?? '')}'`;
      if (t.name === 'bool') return String(Boolean(val ?? false));
      if (t.name === 'number') return String(Number(val ?? 0));
      return `''`;
    }
    case 'move_numeric':
      return String(Number(val ?? 0));
    case 'object':
      return objectExprFromVariable(v);
    case 'vector':
      return vec(t.elem, Array.isArray(val) ? val : []);
    case 'tuple':
      return `[${(Array.isArray(val) ? val : []).map(asStr).join(', ')}]`;
    default:
      return `''`;
  }
}

/** Apply preview-only cast wrapper if edge indicates numeric width. */
function applyCastIfAny(expr: string, e?: PTBEdge): string {
  const width = (e as any)?.cast?.to as string | undefined;
  return width ? `tx.pure.${width}(${expr})` : expr;
}

/** Whether an expression is array-like (so it can be used as-is in tx.* calls). */
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

function amountsExprForSplit(
  raw: string[],
  arrayVarNames: Set<string>,
): string {
  if (raw.length === 0) return '[]';
  if (raw.length === 1) {
    const e = raw[0].trim();
    if (isArrayLikeExpr(e, arrayVarNames)) return e;
  }
  return `[${raw.join(', ')}]`;
}

function emitArrayArgFlat(exprs: string[], arrayVarNames: Set<string>): string {
  if (exprs.length === 0) return '[]';
  if (exprs.length === 1) {
    const e = exprs[0].trim();
    if (isArrayLikeExpr(e, arrayVarNames)) return e;
  }
  return `[${exprs.join(', ')}]`;
}

/**
 * Identify transferObjects inputs robustly.
 * Priority:
 * 1) Ports explicitly labeled 'objects' and 'recipient'
 * 2) Address-typed IN port as recipient
 * 3) Position fallback: last IN port as recipient, others as objects
 * 4) No recipient found -> default to 'myAddress' sentinel
 */
function pickTransferInputs(
  cmd: CommandNode,
  byPort: Map<string, string[]>,
): { objectsExprs: string[]; recipientExpr?: string } {
  const inPorts = (cmd.ports || []).filter(
    (p) => p.role === 'io' && p.direction === 'in',
  );

  const objectsExprs: string[] = [];
  let recipientExpr: string | undefined;

  // 1) Use explicit labels first
  for (const p of inPorts) {
    const vals = byPort.get(p.id) ?? [];
    if (p.label === 'objects') {
      objectsExprs.push(...vals);
    } else if (p.label === 'recipient' && !recipientExpr && vals.length) {
      recipientExpr = vals[0];
    }
  }
  if (recipientExpr && objectsExprs.length) {
    return { objectsExprs, recipientExpr };
  }

  // 2) Type-based detection (address-typed recipient)
  for (const p of inPorts) {
    const vals = byPort.get(p.id) ?? [];
    if (
      !recipientExpr &&
      p.dataType?.kind === 'scalar' &&
      p.dataType.name === 'address' &&
      vals.length
    ) {
      recipientExpr = vals[0];
    } else if (p.label !== 'recipient' && p.label !== 'objects') {
      // treat as object input if not the address port
      if (!(p.dataType?.kind === 'scalar' && p.dataType.name === 'address')) {
        objectsExprs.push(...vals);
      }
    }
  }
  if (recipientExpr && objectsExprs.length) {
    return { objectsExprs, recipientExpr };
  }

  // 3) Positional fallback: last IN port as recipient, others as objects
  if (!recipientExpr && inPorts.length > 0) {
    const last = inPorts[inPorts.length - 1];
    const rest = inPorts.slice(0, -1);
    const lastVals = byPort.get(last.id) ?? [];
    if (lastVals.length) recipientExpr = lastVals[0];
    for (const p of rest) objectsExprs.push(...(byPort.get(p.id) ?? []));
  }

  // 4) If still missing, leave recipient undefined; caller will default to myAddress
  return { objectsExprs, recipientExpr };
}

/** ==== MAIN: Generate ts-sdk code (commands only on Start→…→End paths) ==== */
export function generateTsSdkCode(
  graph: PTBGraph,
  chain: Chain,
  opts?: ExecOptions,
): string {
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

  // Track names that are arrays (vector variables or array-producing results)
  const arrayVarNames = new Set<string>();

  // Wire expressions and per-port mapping
  const portExpr = new Map<string, string>(); // `${nodeId}:${portId}` -> expr

  // === Variables (only those actually used) ===
  let varAuto = 1;
  for (const n of graph.nodes) {
    if (!usedVarIds.has(n.id)) continue;
    const v = n as VariableNode;

    let base = (v.name || '').trim() || `val_${varAuto++}`;
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
  let splitCmdSeq = 0;

  // Collect inputs by IN port
  function collectInputsByPort(node: PTBNode) {
    const byPort = new Map<string, string[]>();
    const ports = (node.ports || []).filter(
      (p) => p.direction === 'in' && p.role === 'io',
    );
    for (const p of ports) {
      const edges = byTarget.get(node.id)?.get(p.id) ?? [];
      const arr: string[] = [];
      for (const e of edges) {
        const key = `${e.source}:${basePortId(e.sourceHandle)}`;
        const expr = portExpr.get(key);
        if (expr) arr.push(applyCastIfAny(expr, e));
      }
      byPort.set(p.id, arr);
    }
    return byPort;
  }

  // Register OUT port expressions
  function registerOutputs(
    node: PTBNode,
    callExpr: string,
    overrideNames?: string[],
  ) {
    const outs = (node.ports || []).filter(
      (p) => p.direction === 'out' && p.role === 'io',
    );

    if (outs.length > 1) {
      const names = (overrideNames ?? []).slice(0, outs.length);
      outs.forEach((p, i) => {
        const key = `${node.id}:${p.id}`;
        const nm = names[i];
        portExpr.set(key, nm ?? callExpr);
      });
      return;
    }

    if (!outs[0]) return;
    const key = `${node.id}:${outs[0].id}`;
    if (overrideNames && overrideNames.length > 1) {
      portExpr.set(key, `[${overrideNames.join(', ')}]`);
      arrayVarNames.add(`[${overrideNames.join(', ')}]` as any);
    } else if (overrideNames && overrideNames.length === 1) {
      portExpr.set(key, overrideNames[0]);
    } else {
      portExpr.set(key, callExpr);
    }
  }

  for (const n of orderedActive) {
    if (n.kind !== 'Command') continue;
    const c = n as CommandNode;
    const byPort = collectInputsByPort(c);

    const declaredOuts =
      (c as any).outputs && (c as any).outputs.length > 0
        ? (c as any).outputs.map((s: string) => s.trim()).filter(Boolean)
        : [];
    const uniqueOuts = declaredOuts.map((o: string) => names.claim(o));

    const assignPrefix =
      uniqueOuts.length > 1
        ? `const [${uniqueOuts.join(', ')}] = `
        : uniqueOuts.length === 1
          ? `const ${uniqueOuts[0]} = `
          : ``;

    switch (c.command) {
      case 'splitCoins': {
        splitCmdSeq += 1;

        const inPorts = (c.ports || []).filter(
          (p) => p.role === 'io' && p.direction === 'in',
        );
        const coinExprs = inPorts.length
          ? (byPort.get(inPorts[0].id) ?? [])
          : [];
        const coinExpr = coinExprs[0] ?? 'tx.gas';

        const amountsPort = (c.ports || []).find(
          (p) =>
            p.role === 'io' && p.direction === 'in' && p.label === 'amounts',
        )?.id;
        let rawAmounts: string[] = [];
        if (amountsPort) rawAmounts = byPort.get(amountsPort) ?? [];
        else
          rawAmounts = inPorts.slice(1).flatMap((p) => byPort.get(p.id) ?? []);

        const amountsExpr = amountsExprForSplit(rawAmounts, arrayVarNames);

        const outArity = splitOutArity(c);
        if (outArity > 1) {
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
        const inPorts = (c.ports || []).filter(
          (p) => p.role === 'io' && p.direction === 'in',
        );
        const destExpr =
          (byPort.get(inPorts[0]?.id || '') ?? [])[0] ?? 'tx.gas';
        const srcExprs = inPorts
          .slice(1)
          .flatMap((p) => byPort.get(p.id) ?? []);
        const call = `tx.mergeCoins(${destExpr}, ${emitArrayArgFlat(srcExprs, arrayVarNames)})`;

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
        const recipient = recipientExpr ?? 'myAddress';
        if (!recipientExpr) ctx.usedMyAddress = true;

        const call = `tx.transferObjects(${emitArrayArgFlat(
          objectsExprs,
          arrayVarNames,
        )}, ${recipient})`;

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
        const elems = (c.ports || [])
          .filter((p) => p.role === 'io' && p.direction === 'in')
          .flatMap((p) => byPort.get(p.id) ?? []);
        const elemType = (c.params as any)?.ui?.elemType as PTBType | undefined;
        const typeExpr = (() => {
          if (!elemType) return `'/* T */'`;
          if (elemType.kind === 'move_numeric') return `'${elemType.width}'`;
          if (elemType.kind === 'scalar') return `'${elemType.name}'`;
          if (elemType.kind === 'object') {
            const tag = elemType.typeTag || '';
            if (!tag) return `'/* object */'`;
            const low = tag.toLowerCase();
            if (low === '0x2::sui::sui') {
              ctx.usedSuiTypeConst = true;
              return 'SUI';
            }
            return `'${tag}'`;
          }
          return `'/* unsupported */'`;
        })();
        const call = `tx.makeMoveVec({ type: ${typeExpr}, elements: ${emitArrayArgFlat(
          elems,
          arrayVarNames,
        )} })`;

        if (assignPrefix) {
          body.w(`${assignPrefix}${call};`);
          uniqueOuts.forEach((n: string) => arrayVarNames.add(n));
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
        const parts = [`target: '${target}'`];
        if (targs.length) parts.push(`typeArguments: [${targs.join(', ')}]`);
        if (args.length) parts.push(`arguments: [${args.join(', ')}]`);
        const call = `tx.moveCall({ ${parts.join(', ')} })`;

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
  out.w(`// Auto-generated from PTB graph (chain: ${chain})`);
  out.w(`import { Transaction } from '@mysten/sui/transactions';`);
  if (ctx.usedSuiTypeConst) out.w(`const SUI = '0x2::sui::SUI';`);
  out.w('');

  if (opts?.myAddress) {
    out.w(`// Provided by caller`);
    out.w(`const myAddress = '${opts.myAddress}';`);
  } else if (ctx.usedMyAddress) {
    out.w(`// Inject your wallet address here (or via an adapter):`);
    out.w(`// const myAddress = '0x...';`);
  }

  out.w(`const tx = new Transaction();`);
  if (opts?.myAddress) out.w(`tx.setSenderIfNotSet(myAddress);`);
  else
    out.w(
      ctx.usedMyAddress
        ? `// tx.setSenderIfNotSet(myAddress);`
        : `// tx.setSenderIfNotSet('<your-address>');`,
    );
  if (typeof opts?.gasBudget === 'number')
    out.w(`tx.setGasBudgetIfNotSet(${opts.gasBudget});`);
  else out.w(`// tx.setGasBudgetIfNotSet(500_000_000);`);

  const varsStr = vars.toString().trim();
  const bodyStr = body.toString().trim();

  if (!varsStr && !bodyStr) {
    out.w('');
    out.w('// No generated steps yet.');
    out.w(
      '// Create nodes and wire variables (Start → … → End) to see code here.',
    );
  } else {
    if (varsStr) out.w(varsStr);
    if (bodyStr) out.w(bodyStr);
  }

  out.w('');
  out.w('export { tx };');
  return out.toString();
}
