// src/codegen/buildTransaction.ts
// -----------------------------------------------------------------------------
// Build a Transaction object from Program IR.
// Policy:
//   - Only moveCall.arguments are pure-serialized (ParamKind-driven).
//   - splitCoins/mergeCoins/transferObjects/makeMoveVec use raw values.
//   - Variable refs are cached to avoid re-serialization per-arg.
//   - {kind:'undef'} becomes JS undefined.
// -----------------------------------------------------------------------------

import { Transaction } from '@mysten/sui/transactions';

import type { ExecOptions, Program, PValue } from './types';
import type { PTBGraph } from '../ptb/graph/types';
import type { Chain } from '../types';
import { serializeMoveArgRuntime } from './argPolicy';
import { preprocess } from './preprocess';

/** Flatten a single nested array one level: [ [a,b] ] -> [a,b] */
function flatten1(xs: any[]): any[] {
  if (xs.length === 1 && Array.isArray(xs[0])) return xs[0];
  return xs;
}

/** Evaluate a PValue into a runtime value. */
function evalValue(
  tx: Transaction,
  v: PValue,
  env: Map<string, any>,
  my?: string,
): any {
  switch (v.kind) {
    case 'undef':
      return undefined;
    case 'ref': {
      if (!env.has(v.name)) throw new Error(`Unbound symbol '${v.name}'`);
      return env.get(v.name);
    }
    case 'scalar': {
      if (typeof v.value === 'string') {
        if ((v.value === 'myAddress' || v.value === 'sender') && my) {
          return my;
        }
      }
      return v.value;
    }
    case 'move_numeric':
      return v.value;
    case 'object': {
      if (v.special === 'gas') return (tx as any).gas;
      if (v.special === 'system') return (tx as any).object.system;
      if (v.special === 'clock') return (tx as any).object.clock;
      if (v.special === 'random') return (tx as any).object.random;
      return (tx as any).object(String(v.id ?? ''));
    }
    case 'vector':
      return v.items.map<any>((x) => evalValue(tx, x as any, env, my));
  }
}

/** Build Transaction according to policy. */
function generate(p: Program, opts?: ExecOptions): Transaction {
  const tx = new Transaction();
  if (opts?.myAddress) tx.setSenderIfNotSet(opts.myAddress);
  if (typeof opts?.gasBudget === 'number')
    tx.setGasBudgetIfNotSet(opts.gasBudget);

  const env = new Map<string, any>();
  const serializeCache = new Map<string, any>(); // key: `${opSeq}:${kind}:${refName}#${idx}`

  // Materialize declared variables (raw)
  for (const v of p.vars) {
    const val = evalValue(tx, v.init, env, opts?.myAddress);
    env.set(v.name, val);
  }

  // Execute operations
  let opSeq = 0;
  for (const op of p.ops) {
    opSeq += 1;

    switch (op.kind) {
      case 'splitCoins': {
        const coin = evalValue(tx, op.coin, env, opts?.myAddress);
        const rawList = op.amounts.map((a) =>
          evalValue(tx, a, env, opts?.myAddress),
        );
        const amounts = flatten1(rawList); // raw numbers/undefined (no pure)
        const res = (tx as any).splitCoins(coin, amounts);
        op.out.names.forEach((nm, i) => env.set(nm, res[i]));
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
        const rcpt = evalValue(tx, op.recipient, env, opts?.myAddress); // RAW (no pure)
        (tx as any).transferObjects(objects, rcpt);
        break;
      }

      case 'makeMoveVec': {
        const rawElems = op.elements.map((e) =>
          evalValue(tx, e, env, opts?.myAddress),
        );
        const vec = (tx as any).makeMoveVec({
          type: undefined,
          elements: rawElems,
        });
        env.set(op.out, vec);
        break;
      }

      case 'moveCall': {
        const targs = op.typeArgs.map((a) =>
          evalValue(tx, a, env, opts?.myAddress),
        );
        const argsRaw = op.args.map((a) =>
          evalValue(tx, a, env, opts?.myAddress),
        );

        const args = argsRaw.map((x, i) => {
          const kind = op.paramKinds[i] ?? 'other';
          const src = op.args[i];

          if (kind === 'txarg') return x;

          if (src.kind === 'ref') {
            const key = `${opSeq}:${kind}:${src.name}#${i}`;
            if (serializeCache.has(key)) return serializeCache.get(key);
            const ser = serializeMoveArgRuntime(tx, x, kind, opts?.myAddress);
            serializeCache.set(key, ser);
            return ser;
          }
          return serializeMoveArgRuntime(tx, x, kind, opts?.myAddress);
        });

        const call = (tx as any).moveCall({
          target: op.target,
          ...(targs.length ? { typeArguments: targs } : {}),
          ...(args.length ? { arguments: args } : {}),
        });

        if (op.rets.mode === 'single') env.set(op.rets.name, call);
        else if (op.rets.mode === 'destructure')
          op.rets.names.forEach((nm, i) => env.set(nm, call[i]));
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
