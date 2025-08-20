// validation.ts
import { findNode, findPort } from './helpers';
import { isTypeCompatible } from './typecheck';
import type { Port, PTBGraph } from './types';

export const isFlowPort = (p: Port) => p.role === 'flow';
export const isIoPort = (p: Port) => p.role === 'io';

export interface ValidationIssue {
  nodeId?: string;
  edgeId?: string;
  message: string;
}
export interface ValidationResult {
  ok: boolean;
  issues: ValidationIssue[];
}

/** Minimal graph validation */
export function validatePTBGraph(g: PTBGraph): ValidationResult {
  const issues: ValidationIssue[] = [];

  // Check for duplicate node IDs
  const nodeIds = new Set<string>();
  for (const n of g.nodes) {
    if (nodeIds.has(n.id))
      issues.push({ nodeId: n.id, message: 'Duplicate node id' });
    nodeIds.add(n.id);
  }

  // Check for duplicate edge IDs
  const edgeIds = new Set<string>();
  for (const e of g.edges) {
    if (edgeIds.has(e.id))
      issues.push({ edgeId: e.id, message: 'Duplicate edge id' });
    edgeIds.add(e.id);
  }

  // Edge validation
  for (const e of g.edges) {
    const s = findNode(g, e.source);
    const t = findNode(g, e.target);
    if (!s)
      issues.push({
        edgeId: e.id,
        message: `Source node not found: ${e.source}`,
      });
    if (!t)
      issues.push({
        edgeId: e.id,
        message: `Target node not found: ${e.target}`,
      });

    const sp = s && findPort(s, e.sourcePort);
    const tp = t && findPort(t, e.targetPort);
    if (!sp)
      issues.push({
        edgeId: e.id,
        message: `Source port not found: ${e.source}.${e.sourcePort}`,
      });
    if (!tp)
      issues.push({
        edgeId: e.id,
        message: `Target port not found: ${e.target}.${e.targetPort}`,
      });

    if (sp && tp) {
      if (sp.role !== e.kind || tp.role !== e.kind)
        issues.push({
          edgeId: e.id,
          message: `Edge kind (${e.kind}) does not match port role`,
        });
      if (sp.direction !== 'out' || tp.direction !== 'in')
        issues.push({
          edgeId: e.id,
          message:
            'Port direction mismatch (source must be out, target must be in)',
        });
      if (!isTypeCompatible(sp.dataType, tp.dataType))
        issues.push({ edgeId: e.id, message: 'Incompatible types' });
    }
  }

  // Require at least Start and End nodes
  const hasStart = g.nodes.some((n) => n.kind === 'Start');
  const hasEnd = g.nodes.some((n) => n.kind === 'End');
  if (!hasStart || !hasEnd)
    issues.push({ message: 'Missing Start or End node' });

  return { ok: issues.length === 0, issues };
}
