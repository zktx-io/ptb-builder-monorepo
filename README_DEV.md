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
