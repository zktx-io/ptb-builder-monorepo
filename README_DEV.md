# PTB Builder Developer Notes

This document is for contributors maintaining the model-root PTB Builder
architecture. Source code and `package.json` are the authority if this document
drifts.

## Product Boundary

PTB Builder helps users author, inspect, render, and edit Sui Programmable
Transaction Block data. It does not own wallet connection, custody, signing,
simulation, execution, or transaction safety guarantees. Host applications
provide wallet and execution adapters.

## Architecture

The semantic root is `@zktx.io/ptb-model`.

```text
RawProgrammableTransaction
  <-> TransactionIR
  <-> PTBGraph
  -> TypeScript SDK code string
  -> Mermaid

ptb-builder UI
  <-> React Flow draft state
  <-> ptbAdapter.ts
  <-> model PTBGraph
```

Rules:

- Model `PTBGraph` is the persisted graph document shape.
- React Flow state is a screen/draft representation. Positions, handles,
  viewport, and selection are not transaction authority.
- Runtime construction starts from `TransactionIR` in `ptb/runtimeAdapter.ts`.
- Generated TypeScript code strings and decoded PTB data are review and
  authoring aids, not trusted signing material.
- Unsupported document shapes, top-level `nodes/edges` documents, builder-local
  codegen, and builder-local decode fallbacks are not runtime paths.

## Repository Areas

- `packages/ptb-model/`: UI-independent raw PTB, `TransactionIR`, `PTBGraph`,
  conversion, validation, Mermaid, and TypeScript SDK code-string rendering.
- `packages/ptb-builder/src/ptb/`: builder document boundary, React Flow/model
  adapter, Core client bridge, metadata caches, runtime adapter, and node
  factories.
- `packages/ptb-builder/src/ui/`: React context, React Flow integration,
  authoring controls, document emission, provider UI state, and diagnostics.
- `packages/example/`: Vite host application using dapp-kit React and
  host-owned simulation/execution callbacks.

## Chain Reads And Transport

Builder code must not add JSON-RPC paths. Do not import
`@mysten/sui/jsonRpc`, `SuiClient`, `getFullnodeUrl`, or JSON-RPC endpoint
helpers.

Builder chain reads use the pinned `@mysten/sui` Core/gRPC surface through
`ptb/suiClient.ts`.

- `createPtbCoreClient()` and `createPtbCoreClientForNetwork()` create Core
  clients for verified transport/network pairs.
- `supportedNetworksForTransport()` is the source for host/example network
  registration.
- Metadata caches are UI/type metadata caches. They must not silently rewrite
  signable ObjectRefs, object versions, object digests, package IDs, or
  transaction arguments.

## Provider And Document Flow

Provider state has separate responsibilities:

- `providerLifecycle.ts`: load tokens, cancellation, and delayed animation-frame
  cleanup.
- `providerUiState.ts`: visible transaction status and persistent notices.
  Provider lifecycle mode stays in `providerLifecycle.ts`; do not duplicate it
  in UI notice state.
- `documentEmission.ts`: debounced PTB document emission, max-wait, flush, and
  cleanup.
- `ptbDoc.ts`: strict `ptb_4` document parsing/building, required
  `modules`/`objects` embeds, canonical document signatures, and viewport
  comparison keys.

Do not reintroduce component-local autosave timers or provider-local sequence
refs without proving the shared helper is insufficient.

## React Flow Boundary

`PtbFlow` owns screen editing, but model conversion must go through the
adapter boundary:

- `ptbAdapter.ts` converts React Flow state to model `PTBGraph` and back.
- `graphSignature.ts` is the semantic no-op gate for provider graph updates.
  It must include protocol-significant fields such as `rawInput`, command
  runtime params, and edge casts.
- Code preview, dry-run, execute, and commit paths should consume a safe
  RF-to-model conversion result instead of calling `rfToPTB()` ad hoc.

## Object Authoring

Object authoring treats SDK Core object facts and raw PTB usage as separate
concepts.

- `objectAuthoring.ts` normalizes SDK Core object id, version, digest, owner,
  and type facts using the model parsers.
- Owner kind does not imply `Receiving` usage.
- Shared object mutability must not be inferred from labels, symbols, type
  tags, or owner kind alone. The user must choose read-only or mutable shared
  usage when the SDK owner is `Shared`.
- `ConsensusAddressOwner` and unknown owner objects are not converted into raw
  PTB object inputs unless a reviewed source-backed mapping is added.
- `VarNode` lookup state is UI draft state. Persisted PTB meaning is the graph
  variable's `value`, `varType`, and `rawInput`.

## MoveCall Authoring

MoveCall nodes use explicit package/module/function input and SDK Core
per-function lookup. Package-wide module scans are not part of the runtime.

MoveCall signature state should be treated as an async authoring boundary:

- stale lookup responses must not patch runtime params or ports;
- generic signatures must preserve the resolved target while waiting for type
  arguments;
- normal "Use" should be cache-aware, with explicit refresh reserved for user
  revalidation.

## Commands

Check root `package.json` before running commands. Available commands:

- `npm run build`
- `npm run test:builder-flow`
- `npm run test:model`
- `npm run lint`
- `npm run format`

Builder and example tests must not run in parallel because both can consume
workspace package build artifacts. Use `npm run test:builder-flow` for the
sequential builder/example gate.

## Review Checklist

Before calling a change complete, review these boundaries together:

- model graph/raw/IR conversion;
- React Flow adapter and graph signature;
- provider load/export/emit states;
- object and MoveCall authoring async paths;
- runtime adapter diagnostics;
- package exports and CSS entry points;
- example host behavior;
- public and developer documentation.

Tests passing is not enough by itself. Walk the affected state and error paths
and verify docs do not describe removed or unsupported behavior.

## Compiler-Phase Review Oracle

Use this oracle when reviewing graph document, diagnostic, conversion, renderer,
or builder diagnostic-channel changes. The invariant is: each phase performs
only its own responsibility, and a diagnostic must not disappear, move to the
wrong channel, or authorize a later phase that it blocks.

| Phase | Canonical API | Responsibility |
| --- | --- | --- |
| Save/load | `validatePTBDocV4()` / `parsePTBDocV4()` | Accept only canonical document data. It must not require execution completeness. |
| Analyze | `analyzePTBGraph()` | Emit all graph diagnostics with `blocks.document` and `blocks.execution`. |
| Compile gate | `parseExecutableGraph()` | Reject graph diagnostics that block execution and return an `ExecutablePTBGraph`. |
| Lower | `graphToTransactionIR()` | For unbranded graphs, analyze first; for branded graphs, reuse stored analysis facts; then produce inspection IR. |
| Emit artifact | `transactionIRToRaw()` / `transactionIRToTsSdkCode()` | Reject IR diagnostics that make raw or SDK-code output unsafe or misleading. |
| Inspect | `transactionIRToMermaid()` and builder preview surfaces | Render best-effort inspection output and keep diagnostics visible. |

Required review tests:

- A phase matrix fixture set that runs the same graph through save/load,
  analyze, compile gate, lower, raw emit, SDK-code emit, and inspection.
- Diagnostic guardrail tests that prove graph diagnostics are created through
  graph metadata, non-graph diagnostics cannot carry graph blocks, malformed
  diagnostics fail at trust boundaries, and prefix routing is not reintroduced.
- Bypass tests that prove execution, dry-run, raw emit, and SDK-code emit cannot
  skip the executable graph or IR diagnostic gates.
- Channel tests that prove analyze diagnostics have at least one visible UI
  surface, autosave does not show diagnostic toasts, explicit user actions do
  show failures, and host callback failures use a host/provider channel rather
  than a model diagnostic channel.

Treat matrix coverage as the first oracle. A document-valid but
execution-invalid graph must save, analyze with diagnostics, fail the compile
gate, lower to IR with diagnostics for inspection, fail raw/SDK-code emission,
and remain renderable in inspection surfaces. A document-blocking graph must
fail document parsing and lower only to an empty diagnostic IR.

## Review Prompt Templates

Use these prompts when asking an agent to review this repository. Adjust the
target files or change description, but keep the evidence and boundary
requirements intact.

### Review Only

```text
Read AGENTS.md first. Review this change against the product purpose and the
model/builder/CLI responsibilities.

The goal is defect discovery, not praise or consensus. Do not defend the
implementation or the plan. Verify whether code, tests, docs, package exports,
examples, and user flows actually agree.

Check for:
- phase leaks across save/analyze/compile/lower/emit/inspect;
- silent drops of diagnostics, evidence, errors, or host failures;
- wrong channels for toast, inline diagnostics, provider notice, or host errors;
- trust-boundary gaps for external JSON, host-built diagnostics, or forged brands;
- bypass paths around parseExecutableGraph, raw/codegen gates, or the model boundary;
- invariant drift across GRAPH_DIAGNOSTIC_META, README, tests, and public APIs.

Report findings first, ordered by severity. Cite file and line evidence for
each finding. Do not edit files. Classify each item as fix-now, separate-plan,
or not-a-defect.
```

### Review And Fix

```text
Read AGENTS.md first. Self-review the current change without defending prior
work or the plan.

Use the product purpose, PTB data boundaries, and Compiler-Phase Review Oracle
as the review criteria. If a finding is fix-now and belongs to the affected
boundary, fix it in this turn. Before editing, inspect the related callers,
callees, schemas, tests, docs, exports, and user flow. Fix the shared invariant,
not only the symptom.

After editing, run the relevant tests/build/lint commands and report only the
observed results. Leave only issues that require a separate plan.
```

### Compiler-Phase Boundary Review

```text
Read AGENTS.md and README_DEV.md's Compiler-Phase Review Oracle first.

Review the change by running the same input through:
save/load -> analyze -> compile gate -> lower -> raw/SDK emit -> inspect.

A document-valid but execution-invalid graph must save, analyze with
diagnostics, fail parseExecutableGraph, lower to IR with diagnostics for
inspection, fail raw/SDK-code emission, and remain visible in inspection output.

A document-blocking graph must fail document parsing and lower only to an empty
diagnostic IR.

Check whether tests lock this phase matrix. If they do not, add or recommend the
smallest test that locks the missing boundary.
```

### External Review Evaluation

```text
Read AGENTS.md first. Evaluate the external review below by content only.

Ignore authority, confidence, wording quality, and code samples unless they are
directly relevant. Do not accept a claim until you verify it against the current
repository. If the external review cites evidence, check the cited file and line
on disk yourself.

Add only verified, goal-aligned findings to the work list. Reject claims that are
wrong, speculative, already covered, or outside the current product boundary.
Keep the evaluation focused on long-term model correctness, builder adaptation
to the model boundary, phase responsibility separation, and verifiable
invariants.
```
