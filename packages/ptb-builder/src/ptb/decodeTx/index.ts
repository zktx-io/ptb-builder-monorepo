// src/ptb/decodeTx/index.ts

// Decode a ProgrammableTransaction into a PTBGraph.
// This file coordinates the decode and delegates small utilities to helpers.

import type { SuiCallArg, SuiTransactionBlockKind } from '@mysten/sui/client';
import { fromHex } from '@mysten/sui/utils';

import {
  findInPortWithFallback,
  firstInPorts,
  outPortsWithPrefix,
} from './findPorts';
import {
  makeAddress,
  makeAddressVector,
  makeBool,
  makeBoolVector,
  makeCommandNode,
  makeGasObject,
  makeId,
  makeIdVector,
  makeNumber,
  makeNumberVector,
  makeObject,
  makeString,
  makeStringVector,
  makeVariableNode,
} from '../factories';
import { O, S, V } from '../graph/typeHelpers';
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
import { PTBModulesEmbed, PTBObjectsEmbed } from '../ptbDoc';
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
      return S('id');

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

// Choose the right variable factory by PTBType so that label matches UI policy.
function makeVarByType(
  t: PTBType,
  opts: { name?: string; value?: unknown },
): VariableNode {
  // object
  if (t.kind === 'object') {
    // use concrete typeTag if present to get "object<typeTag>" label
    const v = makeObject(t.typeTag, { name: opts.name, value: opts.value });
    return v;
  }

  // scalar
  if (t.kind === 'scalar') {
    switch (t.name) {
      case 'address':
        return makeAddress({ name: opts.name, value: opts.value });
      case 'bool':
        return makeBool({ name: opts.name, value: opts.value });
      case 'string':
        return makeString({ name: opts.name, value: opts.value });
      case 'number':
        return makeNumber({ name: opts.name, value: opts.value });
      case 'id':
        return makeId({ name: opts.name, value: opts.value });
    }
  }

  // vector
  if (t.kind === 'vector') {
    const elem = t.elem;
    if (elem?.kind === 'scalar') {
      switch (elem.name) {
        case 'address':
          return makeAddressVector({ name: opts.name, value: opts.value });
        case 'bool':
          return makeBoolVector({ name: opts.name, value: opts.value });
        case 'string':
          return makeStringVector({ name: opts.name, value: opts.value });
        case 'number':
          // width information is not preserved in inferPureType; default to number vector
          return makeNumberVector({ name: opts.name, value: opts.value });
        case 'id':
          return makeIdVector({ name: opts.name, value: opts.value });
      }
    }
  }

  // fallback: keep whatever type but no custom label
  return makeVariableNode(t, { name: opts.name, value: opts.value });
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

/** Remove unused singleton nodes (e.g. gas, my wallet) from the graph. */
function pruneUnusedSingletons(graph: PTBGraph) {
  const singletonIds = [
    KNOWN_IDS.GAS,
    KNOWN_IDS.MY_WALLET,
    KNOWN_IDS.CLOCK,
    KNOWN_IDS.RANDOM,
    KNOWN_IDS.SYSTEM,
  ];

  for (const id of singletonIds) {
    const hasNode = graph.nodes.some((n) => n.id === id);
    if (!hasNode) continue;

    const used = graph.edges.some(
      (e) => e.kind === 'io' && (e.source === id || e.target === id),
    );

    if (!used) {
      graph.nodes = graph.nodes.filter((n) => n.id !== id);
      nodeMap.delete(id);
    }
  }
}

// ---- main -------------------------------------------------------------------

export function decodeTx(
  prog: SuiTransactionBlockKind,
  {
    modules,
    objects,
  }: {
    modules?: PTBModulesEmbed;
    objects?: PTBObjectsEmbed;
  },
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
  (gasVar as any).id = KNOWN_IDS.GAS;
  (gasVar as any).name = (gasVar as any).name ?? 'gas';
  // type-only label policy
  (gasVar as any).label = 'object';

  pushNode(graph, gasVar);
  vt.set('gas', { nodeId: gasVar.id, portId: VAR_OUT, t: O() });

  // Inputs → Variable nodes (use embed.objects to enrich object types)
  (prog.inputs ?? []).forEach((arg, i) => {
    let t: PTBType;
    let init: unknown;

    if (arg.type === 'pure') {
      t = inferPureType(arg);
      init = literalOfPure(arg);
    } else if (arg.type === 'object') {
      const oid = (arg as any).objectId as string | undefined;
      const meta = oid ? objects?.[oid] : undefined;
      t = meta?.typeTag ? O(meta.typeTag) : O();
      init = oid;
    } else {
      t = O();
      init = undefined;
    }
    const node = makeVarByType(t, { name: `input_${i}`, value: init });
    // keep a stable id for inputs
    (node as any).id = `input-${i}`;
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
        sourcesCount: Math.max(1, sources.length || 1),
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
        objectsCount: Math.max(1, objs.length || 1),
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
        elemsCount: Math.max(1, srcs.length || 1),
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

      const elemT = srcs.length && srcs[0]?.t ? srcs[0]!.t! : O();
      vt.set(`res#${idx}#0`, {
        nodeId: node.id,
        portId: 'out_vec',
        t: V(elemT),
      });
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

      const targetStr = `${pkg}::${mod}::${fn}`;
      (node as any).params = {
        ...(node as any).params,
        runtime: { ...(node as any).params?.runtime, target: targetStr },
        moveCall: { package: pkg, module: mod, function: fn, typeArgs: targs },
      };

      const inferredIns = args.map((s) => s.t ?? unknownT);
      let uiAny: any = {
        pkgId: pkg,
        module: mod,
        func: fn,
        _fnTParams: Array.from({ length: targs.length }, () => ''),
        _fnIns: inferredIns,
        _fnOuts: [unknownT],
      };

      if (
        modules &&
        modules[pkg] &&
        modules[pkg][mod] &&
        modules[pkg][mod][fn]
      ) {
        const moduleNames = Object.keys(modules[pkg]);
        const moduleFunctions = Object.fromEntries(
          moduleNames.map((m) => [m, Object.keys(modules[pkg][m])]),
        );
        const sig = modules[pkg][mod][fn];
        uiAny = {
          ...uiAny,
          _nameModules_: moduleNames,
          _moduleFunctions_: moduleFunctions,
          _fnSigs_: modules[pkg],
          pkgLocked: true,
          _fnTParams: Array.from({ length: sig.tparamCount }, () => ''),
          _fnIns: sig.ins.length ? sig.ins : inferredIns,
          _fnOuts: sig.outs.length ? sig.outs : [unknownT],
        };
      }

      (node as any).params = { ...(node as any).params, ui: uiAny };
      (node as any).ports = buildCommandPorts('moveCall', uiAny);
      ensureFlowPorts(node);
      pushNode(graph, node);
      pushFlow(graph, prevCmdId, node.id);
      prevCmdId = node.id;

      // (Optional) Inline type arguments as string variables to in_targ_*
      const tpPorts = ((node as any)?.ports as Port[] | undefined)?.filter(
        (p) => p.id.startsWith('in_targ_'),
      );
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
            `in_targ_${i}`,
            `targ_${i}`,
          );
        });
      }

      // Wire value arguments to in_arg_*
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

      // Register results as vt keys (use out_ret_*; ensure at least one)
      const outs = outPortsWithPrefix(node, 'out_ret_');
      const outCount = Math.max(outs.length || 0, 1);
      for (let i = 0; i < outCount; i++) {
        const pid = outs[i]?.id ?? `out_ret_${i}`;
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

  // Post-pass: upgrade object type from embed.objects (label is untouched)
  if (objects) {
    for (const n of graph.nodes) {
      if (n.kind !== 'Variable') continue;
      const v = n as VariableNode;
      const val = (v as any).value;

      if (typeof val === 'string' && val.startsWith('0x')) {
        const meta = objects[val];
        if (meta?.typeTag) {
          // Only specialize type; keep label type-only ("object")
          if (!v.varType || v.varType.kind !== 'object' || !v.varType.typeTag) {
            v.varType = O(meta.typeTag);
          }
        }
      }
    }
  }

  // Tail → End
  pushFlow(graph, prevCmdId ?? KNOWN_IDS.START, KNOWN_IDS.END);

  // Unused singleton pruning
  pruneUnusedSingletons(graph);

  return { graph, diags };
}
