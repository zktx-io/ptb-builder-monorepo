// src/codegen/buildTsSdkCode.ts

import { PTBGraph } from '../ptb/graph/types';
import { Chain } from '../types';
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

function renderValue(v: PValue): string {
  // treat 'myAddress' / 'sender' as identifiers (no quotes)
  const isSentinel = (s: string) => s === 'myAddress' || s === 'sender';

  switch (v.kind) {
    case 'scalar': {
      if (typeof v.value === 'string') {
        return isSentinel(v.value) ? v.value : `'${v.value}'`;
      }
      return String(v.value);
    }
    case 'move_numeric':
      return String(v.value);
    case 'object':
      if (v.special)
        return v.special === 'gas' ? 'tx.gas' : `tx.object.${v.special}`;
      return `tx.object('${v.id ?? ''}')`;
    case 'vector':
      return `[${v.items.map(renderValue).join(', ')}]`;
    case 'ref':
      return v.name;
  }
}

function generate(p: Program, opts?: ExecOptions): string {
  const header = new W(),
    vars = new W(),
    body = new W();

  header.w(`// Auto-generated from PTB Program (chain: ${p.chain})`);
  header.w(`import { Transaction } from '@mysten/sui/transactions';`);
  if (p.header.usedSuiTypeConst) header.w(`const SUI = '0x2::sui::SUI';`);
  header.w('');

  if (opts?.myAddress) {
    header.w(`const myAddress = '${opts.myAddress}';`);
  } else if (p.header.usedMyAddress) {
    header.w(`// const myAddress = '0x...';`);
  }

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

  // vars
  for (const v of p.vars) vars.w(`const ${v.name} = ${renderValue(v.init)};`);
  if (p.vars.length) vars.w('');

  // ops
  for (const op of p.ops) {
    switch (op.kind) {
      case 'splitCoins': {
        const coin = renderValue(op.coin);
        const amounts =
          op.amounts.length === 1 && op.amounts[0].kind === 'vector'
            ? renderValue(op.amounts[0])
            : `[${op.amounts.map(renderValue).join(', ')}]`;
        if (op.out.mode === 'destructure') {
          body.w(
            `const [${op.out.names.join(', ')}] = tx.splitCoins(${coin}, ${amounts});`,
          );
        } else {
          body.w(`const ${op.out.name} = tx.splitCoins(${coin}, ${amounts});`);
        }
        break;
      }
      case 'mergeCoins': {
        const dest = renderValue(op.destination);
        const srcs =
          op.sources.length === 1 && op.sources[0].kind === 'vector'
            ? renderValue(op.sources[0])
            : `[${op.sources.map(renderValue).join(', ')}]`;
        body.w(`tx.mergeCoins(${dest}, ${srcs});`);
        break;
      }
      case 'transferObjects': {
        const objs =
          op.objects.length === 1 && op.objects[0].kind === 'vector'
            ? renderValue(op.objects[0])
            : `[${op.objects.map(renderValue).join(', ')}]`;
        const rcpt = renderValue(op.recipient);
        body.w(`tx.transferObjects(${objs}, ${rcpt});`);
        break;
      }
      case 'makeMoveVec': {
        const elems =
          op.elements.length === 1 && op.elements[0].kind === 'vector'
            ? renderValue(op.elements[0])
            : `[${op.elements.map(renderValue).join(', ')}]`;
        const out = op.out;
        body.w(
          `const ${out} = tx.makeMoveVec({ type: undefined, elements: ${elems} });`,
        );
        break;
      }
      case 'moveCall': {
        // >>> Multiline pretty-print
        const hasTypeArgs = op.typeArgs.length > 0;
        const hasArgs = op.args.length > 0;

        body.w(`tx.moveCall({`);
        body.push();
        body.w(`target: '${op.target}',`);
        if (hasTypeArgs) {
          body.w(
            `typeArguments: [${op.typeArgs.map(renderValue).join(', ')}],`,
          );
        }
        if (hasArgs) {
          body.w(`arguments: [${op.args.map(renderValue).join(', ')}],`);
        }
        body.pop();
        body.w(`});`);
        // <<< Multiline pretty-print
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
