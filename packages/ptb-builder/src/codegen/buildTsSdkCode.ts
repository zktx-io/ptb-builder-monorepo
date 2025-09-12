// src/codegen/buildTsSdkCode.ts
// -----------------------------------------------------------------------------
// Emit TypeScript code mirroring buildTransaction 1:1.
// - ONLY moveCall.arguments are rendered with pure(...) according to ParamKind.
// - splitCoins/mergeCoins/transferObjects/makeMoveVec are raw.
// - splitCoins outputs destructured into N names.
// - moveCall returns: 0 -> no binding, 1 -> const x = call, N -> const [a,b]=call
// - {kind:'undef'} rendered as `undefined`.
// -----------------------------------------------------------------------------

import { PTBGraph } from '../ptb/graph/types';
import { Chain } from '../types';
import { renderMoveArgCode } from './argPolicy';
import { preprocess } from './preprocess';
import { ExecOptions, Program, PValue } from './types';

class W {
  private b: string[] = [];
  private i = 0;
  w(s = '') {
    this.b.push(`${'  '.repeat(this.i)}${s}`);
  }
  push() {
    this.i++;
  }
  pop() {
    this.i = Math.max(0, this.i - 1);
  }
  toString() {
    return this.b.join('\n');
  }
}

const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

/** Render PValue for non-serialized contexts (raw). */
function renderRawValue(v: PValue): string {
  switch (v.kind) {
    case 'undef':
      return 'undefined';
    case 'ref':
      return v.name;
    case 'scalar': {
      if (typeof v.value === 'string') return `'${esc(v.value)}'`;
      return String(v.value);
    }
    case 'move_numeric':
      return String(v.value);
    case 'object': {
      if (v.special === 'gas') return 'tx.gas';
      if (v.special === 'system') return 'tx.object.system';
      if (v.special === 'clock') return 'tx.object.clock';
      if (v.special === 'random') return 'tx.object.random';
      return `tx.object('${esc(v.id ?? '')}')`;
    }
    case 'vector':
      return `[${v.items.map(renderRawValue).join(', ')}]`;
  }
}

function generate(p: Program, opts?: ExecOptions): string {
  const header = new W(),
    vars = new W(),
    body = new W();

  header.w(`// Auto-generated from PTB Program (chain: ${p.chain})`);
  header.w(`import { Transaction } from '@mysten/sui/transactions';`);
  header.w('');

  if (opts?.myAddress) header.w(`const myAddress = '${opts.myAddress}';`);
  else if (p.header.usedMyAddress) header.w(`// const myAddress = '0x...';`);

  header.w(`const tx = new Transaction();`);
  if (opts?.myAddress) header.w(`tx.setSenderIfNotSet(myAddress);`);
  else
    header.w(
      p.header.usedMyAddress
        ? `// tx.setSenderIfNotSet(myAddress);`
        : `// tx.setSenderIfNotSet('<your-address>');`,
    );

  if (typeof opts?.gasBudget === 'number')
    header.w(`tx.setGasBudgetIfNotSet(${opts.gasBudget});`);
  else header.w(`// tx.setGasBudgetIfNotSet(500_000_000);`);
  header.w('');

  // Variables (raw)
  for (const v of p.vars)
    vars.w(`const ${v.name} = ${renderRawValue(v.init)};`);
  if (p.vars.length) vars.w('');

  // Ops
  for (const op of p.ops) {
    switch (op.kind) {
      case 'splitCoins': {
        const coin = renderRawValue(op.coin);
        const list = `[${op.amounts.map(renderRawValue).join(', ')}]`;
        if (op.out.names.length === 1) {
          body.w(
            `const [${op.out.names[0]}] = tx.splitCoins(${coin}, ${list});`,
          );
        } else {
          body.w(
            `const [${op.out.names.join(', ')}] = tx.splitCoins(${coin}, ${list});`,
          );
        }
        break;
      }

      case 'mergeCoins': {
        const dest = renderRawValue(op.destination);
        const srcs = `[${op.sources.map(renderRawValue).join(', ')}]`;
        body.w(`tx.mergeCoins(${dest}, ${srcs});`);
        break;
      }

      case 'transferObjects': {
        const objs = `[${op.objects.map(renderRawValue).join(', ')}]`;
        const rcpt = renderRawValue(op.recipient); // RAW (no pure)
        body.w(`tx.transferObjects(${objs}, ${rcpt});`);
        break;
      }

      case 'makeMoveVec': {
        const elems = `[${op.elements.map(renderRawValue).join(', ')}]`;
        body.w(
          `const ${op.out} = tx.makeMoveVec({ type: undefined, elements: ${elems} });`,
        );
        break;
      }

      case 'moveCall': {
        const targs = op.typeArgs.length
          ? `[${op.typeArgs.map(renderRawValue).join(', ')}]`
          : '';
        const argsRendered = op.args.map((a, i) =>
          renderMoveArgCode(renderRawValue(a), op.paramKinds[i] ?? 'other'),
        );
        const args = argsRendered.length ? `[${argsRendered.join(', ')}]` : '';

        const callExprLines: string[] = [];
        callExprLines.push(`target: '${esc(op.target)}',`);
        if (targs) callExprLines.push(`typeArguments: ${targs},`);
        if (args) callExprLines.push(`arguments: ${args},`);

        const callExpr = `tx.moveCall({\n${'  '.repeat(body['i'] + 1)}${callExprLines.join(
          `\n${'  '.repeat(body['i'] + 1)}`,
        )}\n${'  '.repeat(body['i'])}})`;

        if (op.rets.mode === 'none') {
          body.w(callExpr + `;`);
        } else if (op.rets.mode === 'single') {
          body.w(`const ${op.rets.name} = ${callExpr};`);
        } else {
          body.w(`const [${op.rets.names.join(', ')}] = ${callExpr};`);
        }
        break;
      }
    }
  }

  const out = new W();
  out.w(header.toString());
  if (p.vars.length) out.w(vars.toString());
  if (p.ops.length) out.w(body.toString());
  out.w('');
  out.w('export { tx };');
  return out.toString();
}

export function buildTsSdkCode(
  graph: PTBGraph,
  chain: Chain,
  opts?: ExecOptions,
): string {
  const p = preprocess(graph, chain);
  return generate(p, opts);
}
