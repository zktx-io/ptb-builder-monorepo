// src/ptb/decodeTx.ts
// Direct programmable-tx → PTBGraph decoder (no separate IR).
// - Ports are materialized from the registry (single source of truth).
// - Values tracked via a tiny ValueTable: Input / Result / NestedResult / Gas.
// - Policies: splitCoins multi-outputs, auto-pack vectors, etc.
// - Start/End/Gas/Variables are created via NodeFactories for consistency.
// - IO handle ids use buildHandleId(port), matching PTBHandleIO policy.

import type {
  SuiCallArg,
  SuiMoveNormalizedModules,
  SuiTransactionBlockKind,
} from '@mysten/sui/client';
import { fromHex } from '@mysten/sui/utils';

import { buildHandleId } from './graph/helpers';
import { O, S, V } from './graph/typeHelpers';
import type {
  Port,
  PTBEdge,
  PTBGraph,
  PTBNode,
  PTBType,
  VariableNode,
} from './graph/types';
import { FLOW_NEXT, FLOW_PREV, VAR_OUT } from './portTemplates';
import { materializeCommandPorts } from '../ui/nodes/cmds/registry';
import { labelFromType, NodeFactories } from '../ui/nodes/nodeFactories';

// ---------- constants ---------------------------------------------------------

const START_ID = '@start';
const END_ID = '@end';

// ---------- tiny value table --------------------------------------------------

type ValKey = string; // "in#0" | "res#3#1" | "gas"
type SourceRef = { nodeId: string; portId: string; t?: PTBType };

const vkey = (arg: any): ValKey | undefined => {
  if (typeof arg === 'object') {
    if ('Input' in arg) return `in#${arg.Input}`;
    if ('Result' in arg) return `res#${arg.Result}#0`;
    if ('NestedResult' in arg) {
      const [ci, ri] = arg.NestedResult;
      return `res#${ci}#${ri}`;
    }
  }
  return 'gas'; // e.g., "GasCoin"
};

class ValueTable {
  private m = new Map<ValKey, SourceRef>();
  set(k: ValKey, ref: SourceRef) {
    this.m.set(k, ref);
  }
  get(k: ValKey): SourceRef | undefined {
    return this.m.get(k);
  }
}

// ---------- types, labels & literals -----------------------------------------

const unknownT = { kind: 'unknown' } as PTBType;

/** Normalize SuiCallArg → PTBType (numbers unified to scalar 'number'). */
function inferPureType(input: SuiCallArg): PTBType {
  if (input.type !== 'pure') return O(); // object ref

  switch (input.valueType) {
    case 'address':
      return S('address');
    case 'bool':
      return S('bool');
    case 'string':
      return S('string');
    case '0x2::object::ID':
      return O();

    // number scalars
    case 'u8':
    case 'u16':
    case 'u32':
    case 'u64':
    case 'u128':
    case 'u256':
      return S('number');

    // vector<number>
    case 'vector<u8>':
    case 'vector<u16>':
    case 'vector<u32>':
    case 'vector<u64>':
    case 'vector<u128>':
    case 'vector<u256>':
      return V(S('number'));

    // other vectors
    case 'vector<address>':
      return V(S('address'));
    case 'vector<bool>':
      return V(S('bool'));
    case 'vector<string>':
      return V(S('string'));

    default:
      return unknownT;
  }
}

function literalOfPure(input: SuiCallArg): unknown {
  if (input.type !== 'pure') return undefined;
  if (input.valueType === 'vector<u8>') {
    return typeof input.value === 'string'
      ? Array.from(fromHex(input.value))
      : input.value;
  }
  return input.value;
}

// ---------- nodes/ports/handles ----------------------------------------------

// Map of nodeId → node, to compute handle ids reliably when creating edges.
const nodeMap = new Map<string, PTBNode>();

function pushNode(graph: PTBGraph, n: PTBNode) {
  graph.nodes.push(n);
  nodeMap.set(n.id, n);
}

// Ensure flow ports exist (safety net for command nodes).
function ensureFlowPorts(node: PTBNode) {
  const list = ((node as any).ports ?? []) as Port[];
  if (!list.some((p) => p.id === FLOW_PREV)) {
    list.push({
      id: FLOW_PREV,
      role: 'flow',
      direction: 'in',
      label: 'prev',
    } as any);
  }
  if (!list.some((p) => p.id === FLOW_NEXT)) {
    list.push({
      id: FLOW_NEXT,
      role: 'flow',
      direction: 'out',
      label: 'next',
    } as any);
  }
  (node as any).ports = list;
}

function makeCommand(kind: string, ui?: Record<string, unknown>): PTBNode {
  const cmd = NodeFactories.command(kind as any, { ui });
  // registry already materializes ports; enforce flow safety
  ensureFlowPorts(cmd);
  return cmd as PTBNode;
}

/** (nodeId, portId) → concrete RF handle id using buildHandleId(port). */
function handleIdBy(nodeId: string, portId: string): string {
  const n = nodeMap.get(nodeId);
  const p = ((n as any)?.ports as Port[] | undefined)?.find(
    (pp) => pp.id === portId,
  );
  return p ? buildHandleId(p) : portId; // fallback: raw id
}

/** Push an IO edge with correct handle ids on both ends. */
function pushIoEdge(
  graph: PTBGraph,
  src: SourceRef,
  tgtNodeId: string,
  tgtPortId: string,
  tag: string,
) {
  graph.edges.push({
    kind: 'io',
    id: `io:${src.nodeId}->${tgtNodeId}[${tag}]`,
    source: src.nodeId,
    sourcePort: handleIdBy(src.nodeId, src.portId),
    target: tgtNodeId,
    targetPort: handleIdBy(tgtNodeId, tgtPortId),
  } as PTBEdge);
}

/** Same as above but target given as Port. */
function pushIoEdgeToPort(
  graph: PTBGraph,
  src: SourceRef,
  tgtNodeId: string,
  tgt: Port,
  tag: string,
) {
  pushIoEdge(graph, src, tgtNodeId, tgt.id, tag);
}

/** If target expects a vector but we have multiple scalars, auto-insert MakeMoveVec packer. */
function ensurePackedVector(
  graph: PTBGraph,
  sources: SourceRef[],
  targetVec: PTBType,
): SourceRef {
  const isVector = (targetVec as any)?.kind === 'vector';
  if (!isVector) return sources[0];
  if (sources.length === 1) return sources[0];

  const idNode = NodeFactories.command('makeMoveVec', {
    ui: { elemsExpanded: true, elemsCount: sources.length },
  }) as PTBNode;
  pushNode(graph, idNode);

  sources.forEach((s, i) => {
    pushIoEdge(graph, s, idNode.id, `in_elem_${i}`, `elem_${i}`);
  });

  return {
    nodeId: idNode.id,
    portId: 'out_vec',
    t: V((targetVec as any).elem ?? O()),
  };
}

function firstInPorts(node: PTBNode): Port[] {
  const ports = (node as any)?.ports as Port[] | undefined;
  return (ports || []).filter((p) => p.role === 'io' && p.direction === 'in');
}

function outPorts(node: PTBNode, prefix: string): Port[] {
  const ports = (node as any)?.ports as Port[] | undefined;
  return (ports || []).filter((p) => p.id.startsWith(prefix));
}

/** Try to find a specific in port; if missing, fallback by prefix or by simple type predicate. */
function findInPortWithFallback(
  node: PTBNode,
  preferredId: string,
  fallbackPrefix?: string,
  index?: number,
  typePredicate?: (t?: PTBType) => boolean,
): Port | undefined {
  const ports = (node as any)?.ports as Port[] | undefined;
  if (!ports?.length) return undefined;

  const exact = ports.find((p) => p.id === preferredId);
  if (exact) return exact;

  if (fallbackPrefix) {
    const prefixed = ports
      .filter(
        (p) =>
          p.role === 'io' &&
          p.direction === 'in' &&
          p.id.startsWith(fallbackPrefix),
      )
      .sort((a, b) => a.id.localeCompare(b.id));
    if (prefixed.length)
      return typeof index === 'number' ? prefixed[index] : prefixed[0];
  }

  if (typePredicate) {
    const typed = ports.filter(
      (p) =>
        p.role === 'io' && p.direction === 'in' && typePredicate(p.dataType),
    );
    if (typed.length)
      return typeof index === 'number' ? typed[index] : typed[0];
  }

  // last resort: first input port
  return firstInPorts(node)[index ?? 0];
}

// ---------- module function signature (optional) -----------------------------

function getFnSig(
  modules: Record<string, SuiMoveNormalizedModules> | undefined,
  pkg: string,
  mod: string,
  fn: string,
): any | undefined {
  const pkgEntry = (modules as any)?.[pkg];
  if (!pkgEntry) return undefined;
  const modEntry = pkgEntry?.modules?.[mod] ?? pkgEntry?.[mod];
  return modEntry?.exposedFunctions?.[fn];
}

// ---------- main -------------------------------------------------------------

export function decodeTx(
  prog: SuiTransactionBlockKind,
  modules?: Record<string, SuiMoveNormalizedModules>,
): {
  graph: PTBGraph;
  diags: { level: 'info' | 'warn' | 'error'; msg: string }[];
} {
  nodeMap.clear();

  if (prog.kind !== 'ProgrammableTransaction') {
    return {
      graph: { nodes: [], edges: [] },
      diags: [
        { level: 'warn', msg: `Not ProgrammableTransaction: ${prog.kind}` },
      ],
    };
  }

  const diags: { level: 'info' | 'warn' | 'error'; msg: string }[] = [];
  const graph: PTBGraph = { nodes: [], edges: [] };
  const vt = new ValueTable();

  // Start/End via factories
  const start = NodeFactories.start();
  const end = NodeFactories.end();
  // Override stable ids so we can wire Start/End deterministically
  (start as any).id = START_ID;
  (end as any).id = END_ID;
  pushNode(graph, start);
  pushNode(graph, end);

  // Seed "gas" variable so vkey("GasCoin") → "gas" resolves
  const gasVar = NodeFactories.objectGas();
  pushNode(graph, gasVar);
  vt.set('gas', { nodeId: gasVar.id, portId: VAR_OUT, t: O() });

  // Inputs → Variable nodes (via factory)
  (prog.inputs || []).forEach((arg, i) => {
    const t = arg.type === 'pure' ? inferPureType(arg) : O();
    const lit = literalOfPure(arg);
    const node: VariableNode = NodeFactories.variable(t, {
      name: `input_${i}`,
      label: labelFromType(t),
      value: lit,
    });
    // make stable id for predictability (optional)
    (node as any).id = `input-${i}`;
    pushNode(graph, node);
    vt.set(`in#${i}`, { nodeId: node.id, portId: VAR_OUT, t });
  });

  // Commands
  let prevCmdId: string | undefined = START_ID;

  (prog.transactions || []).forEach((tx: any, idx: number) => {
    // splitCoins --------------------------------------------------------------
    if ('SplitCoins' in tx) {
      const [coinArg, amountArgs] = tx.SplitCoins as [any, any[]];
      const coinRef = vt.get(vkey(coinArg)!);
      const amounts = (amountArgs || [])
        .map((a) => vt.get(vkey(a)!))
        .filter(Boolean) as SourceRef[];

      const node = makeCommand('splitCoins', {
        amountsExpanded: true,
        amountsCount: Math.max(1, amounts.length || 2),
      });
      (node as any).id = `cmd-${idx}`;
      pushNode(graph, node);

      // flow
      graph.edges.push({
        kind: 'flow',
        id: `flow:${prevCmdId}->${node.id}`,
        source: prevCmdId!,
        sourcePort: FLOW_NEXT,
        target: node.id,
        targetPort: FLOW_PREV,
      } as PTBEdge);
      prevCmdId = node.id;

      // io: coin
      if (coinRef) {
        const inCoin = findInPortWithFallback(
          node,
          'in_coin',
          'in_coin',
          0,
          (t) => (t as any)?.kind === 'object',
        );
        if (inCoin) pushIoEdgeToPort(graph, coinRef, node.id, inCoin, 'coin');
      }

      // io: amounts (vector<number>)
      if (amounts.length > 0) {
        const inAmounts =
          findInPortWithFallback(
            node,
            'in_amounts',
            'in_amount',
            0,
            (t) => (t as any)?.kind === 'vector',
          ) || findInPortWithFallback(node, 'in_amounts', undefined, 0);
        if (inAmounts) {
          const packed = ensurePackedVector(
            graph,
            amounts,
            inAmounts.dataType ?? V(S('number')),
          );
          pushIoEdgeToPort(graph, packed, node.id, inAmounts, 'amounts');
        }
      }

      // results
      const outs = outPorts(node, 'out_coin_');
      const n = Math.max(
        outs.length,
        (node as any)?.params?.ui?.amountsCount ?? 1,
      );
      for (let i = 0; i < n; i++) {
        const pid = outs[i]?.id ?? `out_coin_${i}`;
        vt.set(`res#${idx}#${i}`, { nodeId: node.id, portId: pid, t: O() });
      }
      return;
    }

    // mergeCoins --------------------------------------------------------------
    if ('MergeCoins' in tx) {
      const [destArg, srcArgs] = tx.MergeCoins as [any, any[]];
      const destRef = vt.get(vkey(destArg)!);
      const sources = (srcArgs || [])
        .map((a) => vt.get(vkey(a)!))
        .filter(Boolean) as SourceRef[];

      const node = makeCommand('mergeCoins', {
        sourcesExpanded: true,
        sourcesCount: Math.max(1, sources.length || 2),
      });
      (node as any).id = `cmd-${idx}`;
      pushNode(graph, node);

      graph.edges.push({
        kind: 'flow',
        id: `flow:${prevCmdId}->${node.id}`,
        source: prevCmdId!,
        sourcePort: FLOW_NEXT,
        target: node.id,
        targetPort: FLOW_PREV,
      } as PTBEdge);
      prevCmdId = node.id;

      if (destRef) {
        const inDest = findInPortWithFallback(
          node,
          'in_dest',
          'in_dest',
          0,
          (t) => (t as any)?.kind === 'object',
        );
        if (inDest) pushIoEdgeToPort(graph, destRef, node.id, inDest, 'dest');
      }

      sources.forEach((s, i) => {
        const inSrcI =
          findInPortWithFallback(
            node,
            `in_source_${i}`,
            'in_source_',
            i,
            (t) => (t as any)?.kind === 'object',
          ) || findInPortWithFallback(node, `in_src_${i}`, 'in_src_', i);
        if (inSrcI) pushIoEdgeToPort(graph, s, node.id, inSrcI, `src_${i}`);
      });
      return;
    }

    // transferObjects ---------------------------------------------------------
    if ('TransferObjects' in tx) {
      const [objArgs, recipientArg] = tx.TransferObjects as [any[], any];
      const objs = (objArgs || [])
        .map((a) => vt.get(vkey(a)!))
        .filter(Boolean) as SourceRef[];
      const recp = vt.get(vkey(recipientArg)!);

      const node = makeCommand('transferObjects', {
        objectsExpanded: true,
        objectsCount: Math.max(1, objs.length || 2),
      });
      (node as any).id = `cmd-${idx}`;
      pushNode(graph, node);

      graph.edges.push({
        kind: 'flow',
        id: `flow:${prevCmdId}->${node.id}`,
        source: prevCmdId!,
        sourcePort: FLOW_NEXT,
        target: node.id,
        targetPort: FLOW_PREV,
      } as PTBEdge);
      prevCmdId = node.id;

      if (recp) {
        const inRec =
          findInPortWithFallback(
            node,
            'in_recipient',
            'in_recipient',
            0,
            (t) => (t as any)?.name === 'address',
          ) || findInPortWithFallback(node, 'in_recipient', undefined, 0);
        if (inRec) pushIoEdgeToPort(graph, recp, node.id, inRec, 'recipient');
      }

      objs.forEach((s, i) => {
        const inObjI =
          findInPortWithFallback(
            node,
            `in_object_${i}`,
            'in_object_',
            i,
            (t) => (t as any)?.kind === 'object',
          ) || findInPortWithFallback(node, `in_obj_${i}`, 'in_obj_', i);
        if (inObjI) pushIoEdgeToPort(graph, s, node.id, inObjI, `obj_${i}`);
      });
      return;
    }

    // makeMoveVec -------------------------------------------------------------
    if ('MakeMoveVec' in tx) {
      const [_maybeTp, elems] = tx.MakeMoveVec as [any, any[]];
      const srcs = (elems || [])
        .map((a) => vt.get(vkey(a)!))
        .filter(Boolean) as SourceRef[];

      const node = makeCommand('makeMoveVec', {
        elemsExpanded: true,
        elemsCount: Math.max(1, srcs.length || 2),
      });
      (node as any).id = `cmd-${idx}`;
      pushNode(graph, node);

      graph.edges.push({
        kind: 'flow',
        id: `flow:${prevCmdId}->${node.id}`,
        source: prevCmdId!,
        sourcePort: FLOW_NEXT,
        target: node.id,
        targetPort: FLOW_PREV,
      } as PTBEdge);
      prevCmdId = node.id;

      srcs.forEach((s, i) => {
        const inElemI =
          findInPortWithFallback(node, `in_elem_${i}`, 'in_elem_', i) ||
          findInPortWithFallback(node, `in_el_${i}`, 'in_el_', i);
        if (inElemI) pushIoEdgeToPort(graph, s, node.id, inElemI, `elem_${i}`);
      });

      vt.set(`res#${idx}#0`, { nodeId: node.id, portId: 'out_vec', t: V(O()) });
      return;
    }

    // moveCall ----------------------------------------------------------------
    if ('MoveCall' in tx) {
      const pkg = tx.MoveCall.package as string;
      const mod = tx.MoveCall.module as string;
      const fn = tx.MoveCall.function as string;
      const targs = (tx.MoveCall.type_arguments as string[] | undefined) ?? [];
      const args = (tx.MoveCall.arguments || [])
        .map((a: any) => vt.get(vkey(a)!))
        .filter(Boolean) as SourceRef[];

      const sig = getFnSig(modules, pkg, mod, fn);
      const tpCount = targs.length;
      const paramCount = Array.isArray(sig?.parameters)
        ? sig.parameters.length
        : args.length;
      const retCount = Array.isArray(sig?.return) ? sig.return.length : 1;

      const node = makeCommand('moveCall', {
        argCount: paramCount,
        typCount: tpCount,
        resCount: retCount,
      });
      (node as any).id = `cmd-${idx}`;
      // keep call metadata
      (node as any).params = {
        ...(node as any).params,
        moveCall: { package: pkg, module: mod, function: fn, typeArgs: targs },
      };
      // ports might depend on UI → re-materialize once (defensive)
      (node as any).ports = materializeCommandPorts(node as any);
      ensureFlowPorts(node);
      pushNode(graph, node);

      graph.edges.push({
        kind: 'flow',
        id: `flow:${prevCmdId}->${node.id}`,
        source: prevCmdId!,
        sourcePort: FLOW_NEXT,
        target: node.id,
        targetPort: FLOW_PREV,
      } as PTBEdge);
      prevCmdId = node.id;

      // type args as variables
      const tpPorts = (node as any)?.ports?.filter((p: Port) =>
        p.id.startsWith('in_typ_'),
      ) as Port[] | undefined;
      if (tpPorts?.length) {
        targs.forEach((targ, i) => {
          const v = NodeFactories.variable(S('string'), {
            name: `type_${i}`,
            label: 'string',
            value: targ,
          }) as VariableNode;
          (v as any).id = `typearg-${idx}-${i}`;
          pushNode(graph, v);
          pushIoEdge(
            graph,
            { nodeId: v.id, portId: VAR_OUT, t: S('string') },
            node.id,
            `in_typ_${i}`,
            `typ_${i}`,
          );
        });
      }

      // value args
      const argPortsAll = firstInPorts(node).filter((p) =>
        p.id.startsWith('in_arg_'),
      );
      args.forEach((s, i) => {
        const tgt =
          argPortsAll[i] ||
          findInPortWithFallback(node, `in_arg_${i}`, 'in_arg_', i) ||
          firstInPorts(node)[i];
        if (tgt) pushIoEdgeToPort(graph, s, node.id, tgt, `arg_${i}`);
      });

      // results mapping
      const outs = outPorts(node, 'out_res_');
      const outCount = Math.max(retCount, outs.length || 0, 1);
      for (let i = 0; i < outCount; i++) {
        const pid = outs[i]?.id ?? `out_res_${i}`;
        vt.set(`res#${idx}#${i}`, { nodeId: node.id, portId: pid });
      }
      return;
    }

    // publish / upgrade -------------------------------------------------------
    if ('Publish' in tx) {
      const node = makeCommand('publish');
      (node as any).id = `cmd-${idx}`;
      pushNode(graph, node);
      graph.edges.push({
        kind: 'flow',
        id: `flow:${prevCmdId}->${node.id}`,
        source: prevCmdId!,
        sourcePort: FLOW_NEXT,
        target: node.id,
        targetPort: FLOW_PREV,
      } as PTBEdge);
      prevCmdId = node.id;
      return;
    }

    if ('Upgrade' in tx) {
      const node = makeCommand('upgrade');
      (node as any).id = `cmd-${idx}`;
      pushNode(graph, node);
      graph.edges.push({
        kind: 'flow',
        id: `flow:${prevCmdId}->${node.id}`,
        source: prevCmdId!,
        sourcePort: FLOW_NEXT,
        target: node.id,
        targetPort: FLOW_PREV,
      } as PTBEdge);
      prevCmdId = node.id;
      return;
    }

    diags.push({
      level: 'warn',
      msg: `Unsupported tx at index ${idx}: ${Object.keys(tx)[0]}`,
    });
  });

  // tail → End
  const tail = prevCmdId ?? START_ID;
  graph.edges.push({
    kind: 'flow',
    id: `flow:${tail}->${END_ID}`,
    source: tail,
    sourcePort: FLOW_NEXT,
    target: END_ID,
    targetPort: FLOW_PREV,
  } as PTBEdge);

  return { graph, diags };
}
