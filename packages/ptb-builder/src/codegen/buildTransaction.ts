// src/codegen/buildTransaction.ts

import { Transaction } from '@mysten/sui/transactions';

import type { ExecOptions, Program, PValue } from './types';
import type { PTBGraph } from '../ptb/graph/types';
import type { Chain } from '../types';
import { preprocess } from './preprocess';

/** 1-level flatten: [a, [b, c], d] -> [a, b, c, d] */
function flatten1(xs: any[]): any[] {
  if (xs.length === 1 && Array.isArray(xs[0])) return xs[0];
  return xs;
}

function isDecString(s: unknown): s is string {
  return typeof s === 'string' && /^\d+$/.test(s);
}
function isHexAddr(s: unknown): s is string {
  return typeof s === 'string' && /^0x[0-9a-fA-F]+$/.test(s);
}
function isMySentinel(s: unknown): s is string {
  return s === 'myAddress' || s === 'sender';
}

function injectMy<T>(v: T, my?: string): T {
  if (!my) return v;
  if (typeof v === 'string') return isMySentinel(v) ? (my as any) : (v as any);
  if (Array.isArray(v)) return v.map((x) => injectMy(x, my)) as any;
  return v;
}

/** Evaluate a PValue into a tx-ready runtime value. */
function evalValue(
  tx: Transaction,
  v: PValue,
  env: Map<string, any>,
  my?: string,
): any {
  // explicit 'any' to avoid TS7024 in recursive union return
  switch (v.kind) {
    case 'ref': {
      if (!env.has(v.name)) throw new Error(`Unbound symbol '${v.name}'`);
      return env.get(v.name);
    }
    case 'scalar': {
      // Replace 'myAddress'/'sender' only if ExecOptions provided
      const val = injectMy(v.value, my);
      return val;
    }
    case 'move_numeric':
      return v.value;
    case 'object':
      if (v.special === 'gas') return (tx as any).gas;
      if (v.special === 'system') return (tx as any).object.system;
      if (v.special === 'clock') return (tx as any).object.clock;
      if (v.special === 'random') return (tx as any).object.random;
      return (tx as any).object(String(v.id ?? ''));
    case 'vector':
      return v.items.map<any>((x) => evalValue(tx, x, env, my));
  }
}

/** Wrap numeric-like inputs with tx.pure.u64, passthrough others. */
function toU64Arg(tx: Transaction, x: any) {
  if (typeof x === 'number' || typeof x === 'bigint')
    return (tx as any).pure.u64(x);
  if (isDecString(x)) return (tx as any).pure.u64(x);
  return x;
}

/** Resolve a recipient: allow ref, address literal, or 'myAddress' sentinel. */
function resolveRecipient(tx: Transaction, raw: any, my?: string): any {
  // Late injection for sentinel
  if (isMySentinel(raw)) {
    if (!my) {
      throw new Error(
        `Recipient is '${raw}' but ExecOptions.myAddress was not provided.`,
      );
    }
    return (tx as any).pure.address(my);
  }
  // Address literal
  if (isHexAddr(raw)) return (tx as any).pure.address(raw);
  // Already a tx arg (object/derived), or produced ref
  if (typeof raw !== 'string') return raw;

  // If it's a plain string but not an 0x-address, we cannot coerce safely
  // (keep as-is; upstream should have produced a ref or literal)
  return raw;
}

/** Build a Transaction from a Program. */
function generate(p: Program, opts?: ExecOptions): Transaction {
  const tx = new Transaction();
  if (opts?.myAddress) tx.setSenderIfNotSet(opts.myAddress);
  if (typeof opts?.gasBudget === 'number')
    tx.setGasBudgetIfNotSet(opts.gasBudget);

  const env = new Map<string, any>();

  // 1) Materialize variables
  for (const v of p.vars) {
    const val = evalValue(tx, v.init, env, opts?.myAddress);
    env.set(v.name, val);
  }

  // 2) Execute ops
  for (const op of p.ops) {
    switch (op.kind) {
      case 'splitCoins': {
        const coin = evalValue(tx, op.coin, env, opts?.myAddress);
        const rawList = op.amounts.map((a) =>
          evalValue(tx, a, env, opts?.myAddress),
        );
        const flat = flatten1(rawList);
        const amounts = flat.map((a) => toU64Arg(tx, a));
        const res = (tx as any).splitCoins(coin, amounts);
        if (op.out.mode === 'vector') {
          env.set(op.out.name, res);
        } else {
          op.out.names.forEach((nm, i) => env.set(nm, res[i]));
        }
        break;
      }

      case 'mergeCoins': {
        const dest = evalValue(tx, op.destination, env, opts?.myAddress);
        const raw = op.sources.map((s) =>
          evalValue(tx, s, env, opts?.myAddress),
        );
        const sources = flatten1(raw);
        (tx as any).mergeCoins(dest, sources);
        break;
      }

      case 'transferObjects': {
        const rawObjs = op.objects.map((o) =>
          evalValue(tx, o, env, opts?.myAddress),
        );
        const objects = flatten1(rawObjs);
        let rcpt = evalValue(tx, op.recipient, env, opts?.myAddress);
        rcpt = resolveRecipient(tx, rcpt, opts?.myAddress);
        (tx as any).transferObjects(objects, rcpt);
        break;
      }

      case 'makeMoveVec': {
        const rawElems = op.elements.map((e) =>
          evalValue(tx, e, env, opts?.myAddress),
        );
        const elements = flatten1(rawElems);
        const vec = (tx as any).makeMoveVec({ type: undefined, elements });
        env.set(op.out, vec);
        break;
      }

      case 'moveCall': {
        const targs = op.typeArgs.map((a) =>
          evalValue(tx, a, env, opts?.myAddress),
        );
        const args = op.args.map((a) => evalValue(tx, a, env, opts?.myAddress));
        (tx as any).moveCall({
          target: op.target,
          ...(targs.length ? { typeArguments: targs } : {}),
          ...(args.length ? { arguments: args } : {}),
        });
        break;
      }
    }
  }

  return tx;
}

export function buildTransaction(
  graph: PTBGraph,
  chain: Chain,
  opts?: ExecOptions,
): Transaction {
  const p = preprocess(graph, chain);
  return generate(p, opts);
}
