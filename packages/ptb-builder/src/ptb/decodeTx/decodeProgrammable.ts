// src/ptb/decodeTx/decodeProgrammable.ts

// Decode a ProgrammableTransaction into a PTBGraph.
// This file coordinates the decode and delegates small utilities to helpers.

import type {
  SuiCallArg,
  SuiMoveNormalizedModules,
  SuiTransactionBlockKind,
} from '@mysten/sui/client';
import { fromHex } from '@mysten/sui/utils';

import {
  findInPortWithFallback,
  firstInPorts,
  outPortsWithPrefix,
} from './findPorts';
import { makeCommandNode, makeGasObject, makeVariableNode } from '../factories';
import { labelFromType, O, S, V } from '../graph/typeHelpers';
import {
  buildHandleId,
  type CommandUIParams,
  type Port,
  type PTBEdge,
  type PTBGraph,
  type PTBNode,
  type PTBType,
  type VariableNode,
} from '../graph/types';
import { FLOW_NEXT, FLOW_PREV, PORTS, VAR_OUT } from '../portTemplates';
import { buildCommandPorts } from '../registry';
import { KNOWN_IDS } from '../seedGraph';

// ---- tiny value table -------------------------------------------------------

type ValKey = string; // "in#0" | "res#3#1" | "gas"
type SourceRef = { nodeId: string; portId: string; t?: PTBType };

const vkey = (arg: any): ValKey | undefined => {
  if (typeof arg === 'object' && arg) {
    if ('Input' in arg) return `in#${arg.Input}`;
    if ('Result' in arg) return `res#${arg.Result}#0`;
    if ('NestedResult' in arg) {
      const [ci, ri] = arg.NestedResult;
      return `res#${ci}#${ri}`;
    }
  }
  // Fallback used by "GasCoin" and similar pseudo args.
  return 'gas';
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

// ---- types, labels & literals ----------------------------------------------

const unknownT: PTBType = { kind: 'unknown' };

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

    // number scalars → unify to 'number'
    case 'u8':
    case 'u16':
    case 'u32':
    case 'u64':
    case 'u128':
    case 'u256':
      return S('number');

    // vector<number> (u* vectors)
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

// ---- nodes/ports/handles ----------------------------------------------------

// Map of nodeId → node, to compute handle ids reliably when creating edges.
const nodeMap = new Map<string, PTBNode>();

function pushNode(graph: PTBGraph, n: PTBNode) {
  graph.nodes.push(n);
  nodeMap.set(n.id, n);
}

/** Create Start / End nodes (fixed IDs, flow-only). */
function makeStartNode(): PTBNode {
  return {
    id: KNOWN_IDS.START,
    kind: 'Start',
    label: 'Start',
    position: { x: 0, y: 0 },
    ports: PORTS.start(),
  };
}
function makeEndNode(): PTBNode {
  return {
    id: KNOWN_IDS.END,
    kind: 'End',
    label: 'End',
    position: { x: 0, y: 0 },
    ports: PORTS.end(),
  };
}

/** Ensure flow ports exist (defensive for command nodes). */
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

/** Command constructor (ports via registry). */
function makeCommand(kind: string, ui?: Record<string, unknown>): PTBNode {
  const node = makeCommandNode(kind as any, { ui: ui as CommandUIParams });
  // Registry already materializes ports; enforce flow ports defensively.
  ensureFlowPorts(node as any);
  return node as any as PTBNode;
}

/** (nodeId, portId) → RF handle id (includes optional serialized type suffix). */
function handleIdBy(nodeId: string, portId: string): string {
  const n = nodeMap.get(nodeId);
  const p = ((n as any)?.ports as Port[] | undefined)?.find(
    (pp) => pp.id === portId,
  );
  return p ? buildHandleId(p) : portId; // fallback: raw id (best-effort)
}

/** Push a FLOW edge (prev → next). Uses flow handle ids directly. */
function pushFlow(graph: PTBGraph, prevId: string, nextId: string): void {
  graph.edges.push({
    kind: 'flow',
    id: `flow:${prevId}->${nextId}`,
    source: prevId,
    sourceHandle: FLOW_NEXT,
    target: nextId,
    targetHandle: FLOW_PREV,
  } as PTBEdge);
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
    sourceHandle: handleIdBy(src.nodeId, src.portId),
    target: tgtNodeId,
    targetHandle: handleIdBy(tgtNodeId, tgtPortId),
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

// ---- main -------------------------------------------------------------------

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

  // Start/End
  const start = makeStartNode();
  const end = makeEndNode();
  pushNode(graph, start);
  pushNode(graph, end);

  // Seed "gas"
  const gasVar = makeGasObject();
  (gasVar as any).id = KNOWN_IDS.GAS; // keep stable ID
  (gasVar as any).name = (gasVar as any).name ?? 'gas';
  (gasVar as any).label = (gasVar as any).label ?? 'SUI';

  pushNode(graph, gasVar);
  vt.set('gas', { nodeId: gasVar.id, portId: VAR_OUT, t: O() });

  // Inputs → Variable nodes
  (prog.inputs ?? []).forEach((arg, i) => {
    const t = arg.type === 'pure' ? inferPureType(arg) : O();
    const lit = literalOfPure(arg);
    const node: VariableNode = makeVariableNode(t, {
      name: `input_${i}`,
      label: labelFromType(t),
      value: lit,
    });
    (node as any).id = `input-${i}`; // stable id
    pushNode(graph, node);
    vt.set(`in#${i}`, { nodeId: node.id, portId: VAR_OUT, t });
  });

  // Transactions
  let prevCmdId: string = KNOWN_IDS.START;

  (prog.transactions ?? []).forEach((tx: any, idx: number) => {
    // ---- splitCoins ---------------------------------------------------------
    if ('SplitCoins' in tx) {
      const [coinArg, amountArgs] = tx.SplitCoins as [any, any[]];
      const coinRef = vt.get(vkey(coinArg)!);
      const amounts = (amountArgs ?? [])
        .map((a) => vt.get(vkey(a)!))
        .filter(Boolean) as SourceRef[];

      const node = makeCommand('splitCoins', {
        amountsExpanded: true,
        amountsCount: Math.max(1, amounts.length || 2),
      });
      (node as any).id = `cmd-${idx}`;
      pushNode(graph, node);
      pushFlow(graph, prevCmdId, node.id);
      prevCmdId = node.id;

      // in_coin
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

      // amounts: respect original form strictly
      if (amounts.length > 0) {
        const isSingleVector =
          amounts.length === 1 && (amounts[0].t as any)?.kind === 'vector';

        if (isSingleVector) {
          // Single vector<u64> input → connect to the *first expanded scalar* port.
          // NOTE: Registry has no 'in_amounts' vector port by policy.
          const firstAmount =
            findInPortWithFallback(node, 'in_amount_0', 'in_amount_', 0) ||
            // last resort: any first io/in
            findInPortWithFallback(node, 'in_amount_0');
          if (firstAmount) {
            // Tag clarifies that a vector is being fed into the first expanded slot
            pushIoEdgeToPort(
              graph,
              amounts[0],
              node.id,
              firstAmount,
              'amounts_vec',
            );
          }
        } else {
          // Multiple scalars → connect to expanded ports only (no packing)
          amounts.forEach((s, i) => {
            const inI = findInPortWithFallback(
              node,
              `in_amount_${i}`,
              'in_amount_',
              i,
              (t) => (t as any)?.kind !== 'vector',
            );
            if (inI) pushIoEdgeToPort(graph, s, node.id, inI, `amount_${i}`);
          });
        }
      }

      // results mapping
      const outs = outPortsWithPrefix(node, 'out_coin_');
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

    // ---- mergeCoins ---------------------------------------------------------
    if ('MergeCoins' in tx) {
      const [destArg, srcArgs] = tx.MergeCoins as [any, any[]];
      const destRef = vt.get(vkey(destArg)!);
      const sources = (srcArgs ?? [])
        .map((a) => vt.get(vkey(a)!))
        .filter(Boolean) as SourceRef[];

      const node = makeCommand('mergeCoins', {
        sourcesExpanded: true,
        sourcesCount: Math.max(1, sources.length || 2),
      });
      (node as any).id = `cmd-${idx}`;
      pushNode(graph, node);
      pushFlow(graph, prevCmdId, node.id);
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

    // ---- transferObjects ----------------------------------------------------
    if ('TransferObjects' in tx) {
      const [objArgs, recipientArg] = tx.TransferObjects as [any[], any];
      const objs = (objArgs ?? [])
        .map((a) => vt.get(vkey(a)!))
        .filter(Boolean) as SourceRef[];
      const recp = vt.get(vkey(recipientArg)!);

      const node = makeCommand('transferObjects', {
        objectsExpanded: true,
        objectsCount: Math.max(1, objs.length || 2),
      });
      (node as any).id = `cmd-${idx}`;
      pushNode(graph, node);
      pushFlow(graph, prevCmdId, node.id);
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

    // ---- makeMoveVec --------------------------------------------------------
    if ('MakeMoveVec' in tx) {
      const [_maybeTp, elems] = tx.MakeMoveVec as [any, any[]];
      const srcs = (elems ?? [])
        .map((a) => vt.get(vkey(a)!))
        .filter(Boolean) as SourceRef[];

      const node = makeCommand('makeMoveVec', {
        elemsExpanded: true,
        elemsCount: Math.max(1, srcs.length || 2),
      });
      (node as any).id = `cmd-${idx}`;
      pushNode(graph, node);
      pushFlow(graph, prevCmdId, node.id);
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

    // ---- moveCall -----------------------------------------------------------
    if ('MoveCall' in tx) {
      const pkg = tx.MoveCall.package as string;
      const mod = tx.MoveCall.module as string;
      const fn = tx.MoveCall.function as string;
      const targs = (tx.MoveCall.type_arguments as string[] | undefined) ?? [];
      const args = (tx.MoveCall.arguments ?? [])
        .map((a: any) => vt.get(vkey(a)!))
        .filter(Boolean) as SourceRef[];

      const node = makeCommandNode('moveCall');
      (node as any).id = `cmd-${idx}`;

      // Record on-chain metadata and also set runtime.target for codegen/preprocess.
      const targetStr = `${pkg}::${mod}::${fn}`;
      (node as any).params = {
        ...(node as any).params,
        runtime: {
          ...(node as any).params?.runtime,
          target: targetStr,
        },
        moveCall: { package: pkg, module: mod, function: fn, typeArgs: targs },
      };

      (node as any).ports = buildCommandPorts('moveCall');
      ensureFlowPorts(node);
      pushNode(graph, node);
      pushFlow(graph, prevCmdId, node.id);
      prevCmdId = node.id;

      // type args as inline string variables if "in_typ_*" exists
      const tpPorts = (node as any)?.ports?.filter((p: Port) =>
        p.id.startsWith('in_typ_'),
      ) as Port[] | undefined;
      if (tpPorts?.length) {
        targs.forEach((targ, i) => {
          const v = makeVariableNode(S('string'), {
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
      const outs = outPortsWithPrefix(node, 'out_res_');
      const outCount = Math.max(outs.length || 0, 1);
      for (let i = 0; i < outCount; i++) {
        const pid = outs[i]?.id ?? `out_res_${i}`;
        vt.set(`res#${idx}#${i}`, { nodeId: node.id, portId: pid });
      }
      return;
    }

    // ---- publish / upgrade --------------------------------------------------
    if ('Publish' in tx) {
      const node = makeCommand('publish');
      (node as any).id = `cmd-${idx}`;
      pushNode(graph, node);
      pushFlow(graph, prevCmdId, node.id);
      prevCmdId = node.id;
      return;
    }

    if ('Upgrade' in tx) {
      const node = makeCommand('upgrade');
      (node as any).id = `cmd-${idx}`;
      pushNode(graph, node);
      pushFlow(graph, prevCmdId, node.id);
      prevCmdId = node.id;
      return;
    }

    diags.push({
      level: 'warn',
      msg: `Unsupported tx at index ${idx}: ${Object.keys(tx)[0]}`,
    });
  });

  // Tail → End
  pushFlow(graph, prevCmdId ?? KNOWN_IDS.START, KNOWN_IDS.END);

  return { graph, diags };
}
