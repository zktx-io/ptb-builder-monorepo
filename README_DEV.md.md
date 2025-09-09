# PTB Builder — Developer Documentation

This document is intended for contributors and maintainers.  
It describes internal **policies**, **constraints**, and **TODOs** that govern PTB Builder development.

## 1. Architecture Overview

- **Runtime model**
  - React Flow (RF) is the single source of truth while the editor is open.
  - PTB Graph is a persisted snapshot. RF → PTB sync happens on debounce.
  - PTB → RF sync happens only when `graphEpoch` changes.

- **Core modules**
  - `PtbProvider`: Context, chain caches, execution options, persistence.
  - `PTBFlow`: RF editing, validation, auto-layout, code generation trigger.
  - `CodePip`: Code preview panel with copy, execute, and asset selector.
  - `AssetsModal`: Queries on-chain objects (coins, modules, custom objects).
  - `BaseCommand`, `MoveCallCommand`: Node implementations for commands.

## 2. Policies

### Start / End nodes
- Exactly one Start and one End node must exist.
- `normalizeGraph` merges duplicates into canonical IDs.
- These nodes cannot be deleted (UI and context menu restrictions).

### Handles
- **Flow handles**: strictly one-to-one, no fan-out.  
- **IO handles**:  
  - Fan-out allowed from source.  
  - Target may only have one incoming edge.  
- Use `extractHandles` for consistent RF ↔ PTB conversions.

### Vectors
- Supported: scalars.  
- Not supported: objects,coins, options.  
- UI prevents creation of disallowed vectors.  
- Code does not strictly forbid (kept open for future extension).

### Options
- `tx.option` supported only for scalars.  
- Objects and coins are not allowed inside `option`.

## 3. Constraints

### Graph structure
- No cycles are allowed. `createsLoop` enforces this on Flow edges.
- Dangling or invalid edges are pruned automatically:
  - `pruneDanglingEdges`: removes edges whose handles no longer exist.
  - `pruneIncompatibleIOEdges`: removes IO edges with incompatible port types.

### Code generation
- If an IO edge has no source, skip variable declaration.
- If an IO edge connects two commands, intermediate variable declaration is skipped.
- Nodes not connected by flow edges are deferred (not included in code).
- Generated code must remain minimal and deterministic.

### UI
- **Read-only mode**:
  - No context menu.
  - No new edge creation.
- **Theme**:
  - Initial theme can be configured via props.  
  - Available themes: `light`, `dark`, `cobalt2`, `tokyo-night`, `cream`.  
  - Users can change theme later from the workspace.

## 4. TODOs

- [ ] **MakeMoveVec node**
  - Currently hidden / blocked in UI.
  - Needs policy decision on how to safely construct vectors in codegen.
  - Ensure compatibility with type checker and handle UI.

- [ ] **Vector of objects**
  - Currently not allowed in UI (objects, coins are blocked inside vectors).
  - Code does not enforce strictly (left open for future extension).
  - Decide if `vector<object>` or `vector<coin>` should be explicitly supported.

- [ ] **Option<object>**
  - Currently disallowed (`tx.option` only valid for scalars).
  - Evaluate if supporting `option<object>` has practical use cases.

- [ ] **Nested / multi-level vectors**
  - e.g. `vector<vector<u64>>`.
  - Currently unsupported; UI prevents creation.
  - Need decision on whether to allow in PTB spec.