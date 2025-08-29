// IR → Transaction builder runtime
// Mirrors codegen semantics; resolves symbols and wraps numeric/address where needed.

import { Transaction } from '@mysten/sui/transactions';

import { preprocessToIR } from './preprocess';
import type { ExecOptions, IR, IRInit } from './types';
import type { PTBGraph } from '../ptb/graph/types';
import type { Network } from '../types';

/** 1-level flatten: [a, [b, c], d] -> [a, b, c, d] */
function normalizeListArg1(xs: any[]): any[] {
  const out: any[] = [];
  for (const x of xs) Array.isArray(x) ? out.push(...x) : out.push(x);
  return out;
}

/** tx.pure helpers */
function asTxArgU64(tx: Transaction, v: any) {
  if (typeof v === 'number' || typeof v === 'bigint')
    return (tx as any).pure.u64(v);
  if (typeof v === 'string' && /^\d+$/.test(v)) return (tx as any).pure.u64(v);
  return v;
}
function asTxArgAddress(tx: Transaction, v: any) {
  if (typeof v === 'string') return (tx as any).pure.address(v);
  return v;
}

/** Heuristic: plain 0x-prefixed address string */
function looksLikeAddress(s: string) {
  return /^0x[0-9a-fA-F]+$/.test(s);
}

/** Replace 'myAddress' / 'sender' sentinels with ExecOptions.myAddress (deep). */
function injectMyAddressDeep<T>(val: T, my?: string): T {
  if (!my) return val;
  if (typeof val === 'string') {
    if (val === 'myAddress' || val === 'sender') return my as unknown as T;
    return val as unknown as T;
  }
  if (Array.isArray(val)) {
    return val.map((v) => injectMyAddressDeep(v, my)) as unknown as T;
  }
  return val;
}

/** Strict symbol resolver (non-address). Unknown strings throw. */
function fromEnvStrict(env: Map<string, any>, x: any, my?: string): any {
  const replaced = injectMyAddressDeep(x, my);
  if (typeof replaced !== 'string') return replaced;

  if (!env.has(replaced)) {
    throw new Error(
      `name '${replaced}'. Upstream op didn't register its outputs; check preprocessToIR for split/destructure naming.`,
    );
  }
  return env.get(replaced);
}

/** Address resolver: allows literals like '0xabc...' */
function fromEnvAddress(env: Map<string, any>, x: any, my?: string): any {
  const replaced = injectMyAddressDeep(x, my);
  if (typeof replaced !== 'string') return replaced;
  if (env.has(replaced)) return env.get(replaced);
  if (looksLikeAddress(replaced)) return replaced; // treat as address literal
  // Also allow 'myAddress' if not injected yet (defensive)
  if (replaced === 'myAddress' && my) return my;
  throw new Error(
    `recipient '${replaced}' is not a bound symbol nor an address literal`,
  );
}

function evalInit(tx: Transaction, i: IRInit): any {
  switch (i.kind) {
    case 'scalar':
    case 'move_numeric':
      return i.value;

    case 'object':
      if (i.special === 'gas') return (tx as any).gas;
      if (i.special === 'system') return (tx as any).object.system;
      if (i.special === 'clock') return (tx as any).object.clock;
      if (i.special === 'random') return (tx as any).object.random;
      return (tx as any).object(String(i.id ?? ''));

    case 'vector':
      return i.items.map((x) => evalInit(tx, x));
  }
}

function buildTxFromIR(ir: IR, opts?: ExecOptions): Transaction {
  const tx = new Transaction();

  if (opts?.myAddress) tx.setSenderIfNotSet(opts.myAddress);
  if (typeof opts?.gasBudget === 'number') {
    tx.setGasBudgetIfNotSet(opts.gasBudget);
  }

  const env = new Map<string, any>();

  // Vars
  for (const v of ir.vars) {
    let value = evalInit(tx, v.init);
    value = injectMyAddressDeep(value, opts?.myAddress);
    if (opts?.myAddress && v.name === 'sender') value = opts.myAddress;
    env.set(v.name, value);
  }

  // Ops
  for (const op of ir.ops as any[]) {
    switch (op.kind) {
      case 'splitCoins': {
        const coin = fromEnvStrict(env, op.coin, opts?.myAddress);
        const raw = (op.amounts ?? []).map((a: any) =>
          fromEnvStrict(env, a, opts?.myAddress),
        );
        const flat = raw.length === 1 && Array.isArray(raw[0]) ? raw[0] : raw;
        const amounts = flat.map((a: any) => asTxArgU64(tx, a));

        const res = (tx as any).splitCoins(coin, amounts);

        if (op.out?.mode === 'vector' && typeof op.out.name === 'string') {
          env.set(op.out.name, res);
        } else if (
          op.out?.mode === 'destructure' &&
          Array.isArray(op.out.names)
        ) {
          op.out.names.forEach((nm: string, i: number) => env.set(nm, res[i]));
        }
        break;
      }

      case 'mergeCoins': {
        const dest = fromEnvStrict(env, op.destination, opts?.myAddress);
        const raw = (op.sources ?? []).map((s: any) =>
          fromEnvStrict(env, s, opts?.myAddress),
        );
        const sources = normalizeListArg1(raw);
        (tx as any).mergeCoins(dest, sources);
        break;
      }

      case 'transferObjects': {
        const raw = (op.objects ?? []).map((o: any) =>
          fromEnvStrict(env, o, opts?.myAddress),
        );
        const objects = normalizeListArg1(raw);

        const recipientRaw = fromEnvAddress(env, op.recipient, opts?.myAddress);
        const recipient = asTxArgAddress(tx, recipientRaw);

        (tx as any).transferObjects(objects, recipient);
        break;
      }

      case 'makeMoveVec': {
        const raw = (op.elements ?? []).map((e: any) =>
          fromEnvStrict(env, e, opts?.myAddress),
        );
        const elements = normalizeListArg1(raw);
        const vec = (tx as any).makeMoveVec({ type: undefined, elements });
        if (typeof op.out === 'string') env.set(op.out, vec);
        break;
      }

      case 'moveCall': {
        const args = (op.args ?? []).map((a: any) =>
          fromEnvStrict(env, a, opts?.myAddress),
        );
        (tx as any).moveCall({
          target: op.target,
          ...(op.typeArgs?.length ? { typeArguments: op.typeArgs } : {}),
          ...(args.length ? { arguments: args } : {}),
        });
        break;
      }

      default:
        break;
    }
  }

  return tx;
}

export function buildTransactionBlock(
  graph: PTBGraph,
  network: Network,
  opts?: ExecOptions,
): Transaction {
  const ir = preprocessToIR(graph, network);
  return buildTxFromIR(ir, opts);
}
