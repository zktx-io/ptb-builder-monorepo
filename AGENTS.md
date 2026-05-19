# AGENTS.md

## Product Purpose

PTB Builder is a React/TypeScript toolkit for building, editing, inspecting, and rendering Sui Programmable Transaction Block data.

The package exists to make PTB structure easier to author and review:

- Edit PTBs through a graph UI.
- Convert between graph data and transaction-oriented data.
- Generate TypeScript SDK transaction-building code.
- Decode or load supported Sui PTB inputs into local editable structures.
- Let the host application handle wallet connection, signing, simulation, and execution.

PTB Builder is not a wallet, custody layer, transaction safety guarantee, or autonomous executor. Do not describe it as one.

## Repository Map

Inspect the actual repository before assuming any path, script, package, or API exists. If the repository differs from this map, the repository is the current fact and this section should be updated when the difference is intentional.

Current structure:

- `packages/ptb-model/`: package `@zktx.io/ptb-model`; UI-independent PTB model, TransactionIR, raw PTB conversion, Mermaid renderer, and TS SDK code string renderer.
- `packages/ptb-cli/`: package `@zktx.io/ptb-cli`; CLI for converting local or read-only fetched PTB transaction data to Mermaid through `@zktx.io/ptb-model`.
- `packages/ptb-builder/`: published package `@zktx.io/ptb-builder`.
- `packages/example/`: local Vite example app.
- `.WORK/`: ignored local investigation and planning notes.

Current source areas inside `packages/ptb-builder/src/`:

- `ptb/`: PTB document, graph/model adapters, registry, Core client bridge, and runtime `Transaction` adapter logic for host-owned simulation/execution paths. It must not sign, execute, or take custody.
- `ui/`: React builder UI and React Flow integration.
- `styles/`: package styles and theme exports.
- `types/`: local ambient type declarations for builder UI dependencies.

## Commands

Inspect `package.json` before running project commands. Do not invent scripts.

Current root commands, as of the current `package.json`:

- Install: `npm install`
- Build model package, CLI package, then builder package: `npm run build`
- Run example after build: `npm run dev`
- Run builder-flow tests sequentially: `npm run test:builder-flow`
- Test CLI package with test-source type checking: `npm run test:cli`
- Test model package: `npm run test:model`
- Lint: `npm run lint`
- Format: `npm run format`

Current package commands:

- Model build: `npm run build --workspace @zktx.io/ptb-model`
- Model type check: `npm run typecheck --workspace @zktx.io/ptb-model`
- Model test: `npm run test --workspace @zktx.io/ptb-model`
- CLI build: `npm run build --workspace @zktx.io/ptb-cli`
- CLI type check: `npm run typecheck --workspace @zktx.io/ptb-cli`
- CLI test source type check: `npm run typecheck:test --workspace @zktx.io/ptb-cli`
- CLI test: `npm run test --workspace @zktx.io/ptb-cli`
- Builder build: `cd packages/ptb-builder && npm run build`
- Builder type check: `cd packages/ptb-builder && npm run typecheck`
- Builder test: `cd packages/ptb-builder && npm run test`
- Builder lint: `cd packages/ptb-builder && npm run lint`
- Example dev: `cd packages/example && npm run dev`
- Example test: `cd packages/example && npm run test`
- Example build: `cd packages/example && npm run build`
- Example lint: `cd packages/example && npm run lint`

Never claim a test, build, lint, pack, or verification step passed unless it was actually run and observed successfully. If `package.json` differs from this section, `package.json` wins; say so and update this section when the difference is intentional. If a command does not exist, say so and use the closest available verification.

Do not run builder and example tests in parallel. Both flows consume package
build artifacts, and concurrent clean/build steps can remove `dist/` while the
other test runner is resolving workspace package exports. Use
`npm run test:builder-flow` for the sequential builder/example test gate.

## Communication Rules

- Answer with verified facts and concise conclusions.
- Do not waste tokens on excuses, filler, or unsupported speculation.
- State uncertainty plainly when evidence is incomplete.
- Separate facts, assumptions, and recommendations.
- Do not substitute a long report for implementation when the user requested a fix or change.
- Write repository-visible code comments, public documentation, tests, package descriptions, user-facing strings, and release-facing copy in English. Internal ignored planning notes may be in Korean when that helps the current task, but anything moved into exposed surfaces must be rewritten in English.

## Documentation Review

When editing `AGENTS.md`, `README.md`, files under `docs/` if they exist, package READMEs, runtime-facing instructions, exported API descriptions, or user-facing limitation text, do a first-reader pass before calling the work complete.

Read the changed document as if you are a new agent or human with no prior conversation context. Verify that it communicates:

- The product purpose or user problem the document supports.
- What is implemented, planned, unsupported, or intentionally out of scope.
- The authority and boundary of every tool, workflow, protocol term, number, SDK claim, package claim, or product claim it mentions.
- What the reader should do, and what they must not infer.

If the intended meaning depends on prior chat, hidden context, vague shorthand, or local assumptions, rewrite it. Remove wording that is ambiguous, overly broad, contradictory, likely to make a reader overclaim product support, skip required verification, or optimize for size instead of quality.

## Evidence Standard

Do not work from imagination or unchecked assumptions.

Before applying an external suggestion, review comment, or plan:

- Investigate the claim.
- Check the current codebase, package metadata, lockfiles, official docs, source code, or direct command output.
- Separate verified facts from assumptions.
- Explain the evidence behind the recommendation when it affects architecture, migration, SDK usage, public API, compatibility, or product behavior.
- Do not apply the suggestion blindly.

For current repository behavior:

- Verify directly in `package.json`, lockfiles, and source code under `packages/`.
- Treat comments and README text as hints only; source code and package metadata win.
- If a behavior is not confirmed in code, write it as planned work, an assumption, or do not write it.
- When a current-behavior claim affects architecture, migration, SDK usage, public API, or compatibility, record the concrete source file used as evidence.

For Sui and SDK behavior:

- Identify the target SDK version first, then inspect that SDK's actual source before writing function names, imports, types, transaction structures, or migration rules.
- Prefer current installed dependency source or behavior, downloaded Sui source in `.WORK/sui-mainnet-v1.71.1/`, downloaded TypeScript SDK source in `.WORK/ts-sdks/`, or official Sui source when local evidence is insufficient.
- Official docs and npm metadata may identify the version or migration direction, but they are not a substitute for source inspection.
- Downloaded upstream source under `.WORK/` is evidence only for its recorded commit or version; do not treat it as latest unless the commit or version was just verified.
- When official docs and the pinned installed SDK disagree, implementation must follow the pinned SDK/source actually used by this repository, and the discrepancy should be documented where it affects behavior.
- No guessing. If source evidence is missing, stop and gather it before writing or editing.

## Planning Standard

Every non-trivial implementation plan must compare alternatives before choosing a direction.

Before implementation, identify:

- What prerequisite work should already exist.
- What must be inspected first.
- What alternative development directions are available.
- Why the chosen direction is better for the current goal.
- What risks or scope traps should be avoided.

Plans must be grounded in confirmed objective facts. Distinguish current implemented work from unimplemented expansion, and do not make unimplemented possibilities look like supported functionality.

Do not introduce generalized abstractions for aesthetics, symmetry, or future possibilities before a concrete implementation proves that the verified boundary needs them.

Do not create planning notes, reports, or evidence summaries as a substitute for implementation when the user requested a fix or change. Use investigation to guide the edit, then implement, verify, and report the outcome concisely.

## Work Quality Bar

The goal is not to mechanically clear checklists or follow the plan for its own sake.

Moving to the next phase quickly is not success.

A task is not complete because it was marked "closed"; it is complete only when the affected boundary remains robust under a fresh review from the product purpose, code paths, PTB data boundaries, user flows, tests, package exports, examples, and documentation.

Plans may change during implementation, but any plan change must be grounded in verified code, actual product output, official or pinned source code, or direct command results. Do not change direction from preference, momentum, convenience, or unchecked assumptions.

When speed, small diff size, or plan conformance conflicts with product correctness, evidence quality, maintainability, or user-facing clarity, the latter wins.

## Purpose Anchor

Before planning, reviewing, or implementing a change, state the product purpose and current task goal in concrete terms:

- What user or product problem is this work meant to solve?
- Which part of PTB Builder's PTB authoring, inspection, conversion, rendering, or SDK-code generation boundary does it strengthen?
- What boundary must not be crossed, such as wallet connection, signing, simulation, execution, custody, transaction safety guarantees, or unsupported Sui action support?

Use that purpose statement as the first and final check on the work. A change advances the goal when it implements the requested behavior, removes a defect blocking it, tightens a shared invariant it depends on, or updates tests/docs that define the affected product boundary. If a proposed change does not advance the stated goal, or expands product authority beyond that goal, stop and revise the plan before editing or continuing.

Work from the whole to the part, then back to the whole. Inspect concrete files, line-level defects, edge cases, and failure paths rigorously. Fix defects that affect the current boundary, introduced behavior, shared invariant, or user-facing product claim. Do not let one local detail hide the product goal, and do not let the product goal become an excuse to ignore local defects.

Use this loop while working: state the goal, locate it in the product structure, map related modules and user flows, plan, implement, verify, then review from the product view. In that review, state what improved, what is now possible or still not possible, and whether affected areas show side effects. If problems appear, loop back through the affected boundary before moving on.

## Current Refactor Direction

The current direction is:

- Keep developing the lightweight package: `@zktx.io/ptb-model`.
- Keep the existing published package: `@zktx.io/ptb-builder`.
- Refactor `@zktx.io/ptb-builder` to use `@zktx.io/ptb-model`.

Do not create a separate `ptb-sui` package or rename the model package unless a new explicit decision replaces this one.
Do not keep builder-internal graph shapes, decoder fallbacks, or codegen shortcuts inside `@zktx.io/ptb-model` for compatibility. The builder package should adapt to the model boundary, not the other way around.

Use these local evidence inputs before changing the model boundary:

- `.WORK/sui-mainnet-v1.71.1/`
- `.WORK/ts-sdks/`

These `.WORK/` files are planning and evidence context, not independent authority. Verify their claims against current source code, package metadata, pinned SDK source, or direct command output before using them to justify a model-boundary change.

`@zktx.io/ptb-model` must be designed against the `@mysten/sui` SDK version actually pinned by this repository. Verify the installed SDK version, inspect its actual package source, and record the version or commit in `.WORK/` before scaffolding or changing model types. Investigate the latest stable SDK only when an explicit SDK upgrade or compatibility decision is part of the task.

The model package should stay independent from UI and execution runtime concerns:

- No React or React Flow.
- No DOM or CSS.
- No wallet, signer, or Sui client runtime requirement.
- No runtime `Transaction` object as a required dependency.

`@mysten/sui` may be used as the source of truth for SDK types, BCS schemas, fixtures, and compatibility tests. Do not duplicate SDK behavior from memory. Client, wallet, signer, execution, and runtime transaction-building behavior should remain in `@zktx.io/ptb-builder` or a later explicitly approved adapter package.
When the model needs SDK-defined address, digest, type-tag, or BCS behavior, prefer installed public SDK exports over copying SDK implementation code into this repository. If a needed SDK rule is not available through a public export, document that limitation and add a narrowly scoped local rule only after checking source evidence and affected conversion paths.

Package responsibilities during this refactor:

- `@zktx.io/ptb-model` owns protocol-facing logical data structures and deterministic data transforms: canonical file/document shape, document validation, raw PTB conversion, `TransactionIR`, `PTBGraph`, graph-to-IR and IR-to-graph conversion, Mermaid text rendering, and TypeScript SDK code string rendering.
- `@zktx.io/ptb-model` must stay UI-independent and runtime-execution-independent. It may use pinned SDK source, BCS schemas, fixtures, and compatibility tests as evidence, but it must not depend on React, React Flow, DOM, CSS, UI drawing/layout frameworks, wallet state, Sui clients, host callbacks, or runtime `Transaction` instances.
- Treat `@zktx.io/ptb-model` as the source of truth. A builder defect, UI convenience, non-canonical document, example behavior, or test fixture must not bend the model boundary. If the model changes, it must be because the canonical PTB/document/IR/graph/renderer rule is wrong or incomplete after checking all model conversions and the pinned SDK/source evidence.
- Optimize `@zktx.io/ptb-model` for the cleanest canonical model contract, not for downstream compatibility with builder, CLI, example, previous releases, saved fixtures, or legacy authoring habits. Backward compatibility is not a model-package design goal during this refactor because the model is the repository's PTB source-of-truth package consumed primarily by `@zktx.io/ptb-cli` and `@zktx.io/ptb-builder`, not a broad stable user-facing import API. When a consumer uses non-canonical graph handles, params, raw shapes, aliases, root exports, or repair assumptions, document the correct model usage and update that consumer; do not add aliases, fallbacks, repair paths, compatibility branches, deprecated duplicate fields, or public exports solely to preserve older usage unless a new explicit product decision changes the canonical contract.
- Compatibility work belongs only to an explicitly named PTB flow compatibility utility or separate migration tool, not to the normal model parser, converter, validator, renderer, or graph APIs. The canonical model path must remain legacy-free and reject non-canonical shapes. A compatibility utility may translate older PTB flow or document shapes into the canonical model contract only when that utility is an explicit product decision and is not invoked silently by canonical model APIs.
- Improve `@zktx.io/ptb-model` only when the change makes Sui PTB representation, validation, conversion, graph authoring, inspection rendering, or TypeScript SDK code-string rendering more correct against the pinned SDK or verified Sui source. Do not add non-PTB workflow behavior, UI behavior, or speculative support. When Sui PTB has a command, input, argument, metadata field, or execution semantic that the model cannot faithfully represent in raw, IR, graph, Mermaid, or SDK-code output, document it as unsupported in the model README before expanding support, and keep the supported/unsupported PTB surface list current with the implementation.
- Changes to `@zktx.io/ptb-model` require a stricter review than builder-only changes. Before editing it, inspect the affected parser, validator, converter, renderer, public exports, README claims, model tests, builder call sites, and example call sites. After editing it, re-check every conversion direction it touches (`doc`, `raw`, `IR`, `graph`, Mermaid, TS SDK code) before moving back to builder code.
- `@zktx.io/ptb-model` should be consumed through its root package export. Opening a new package subpath or adding a new root export is a source-of-truth decision: update the model README, public-surface tests, and downstream builder/example imports in the same change.
- `@zktx.io/ptb-cli` owns command-line input/output around the model: local files, stdin, base64 transaction-kind or transaction-data bytes, read-only Sui Core/gRPC transaction fetch by digest, stdout/stderr output, process exit codes, and machine-readable JSON envelopes for agents and scripts.
- `@zktx.io/ptb-cli` must call `@zktx.io/ptb-model` for PTB semantics, validation, and Mermaid rendering. It must not duplicate model conversion rules, parse legacy builder shapes, sign transactions, simulate transactions, execute transactions, connect wallets, or use JSON-RPC.
- `@zktx.io/ptb-builder` owns the React product surface around the model: graph editing, drawing, node placement, React Flow screen state, user interactions, Sui Core reads needed for inspection, local metadata caches, builder-specific document requirements such as supported chain/view/module embeds/object embeds, pseudocode/code preview display, and host-owned runtime `Transaction` construction from a model `TransactionIR`.
- `@zktx.io/ptb-builder` must depend on model boundaries instead of re-implementing, repairing, or forking them. It may adapt a parsed model `PTBGraph` to React Flow and back, but it does not define file format, graph semantics, transaction semantics, canonical parser behavior, Mermaid rules, or TypeScript SDK code-rendering rules.
- Host applications own wallet connection, signing, simulation, execution, custody, and final authorization. Builder may expose callbacks and runtime `Transaction` construction helpers for host-owned flows, but it must not present those flows as builder-owned authority.
- Do not add legacy file migration, compatibility parsing, or canonical graph repair paths inside `@zktx.io/ptb-builder`. Canonical model parsers should reject legacy shapes. If file migration is explicitly required, it belongs in an explicitly named model utility or separate tool outside the normal parser path, never in the builder load path.
- The local example package is a consumer and smoke-test surface for `@zktx.io/ptb-builder`. It should demonstrate the public builder API; it must not introduce hidden product behavior, alternate parsing rules, or transaction authority that the builder package does not own.

## PTB Data Boundary

The target data model has three different responsibilities:

- `RawProgrammableTransaction`: normalized Sui PTB-shaped input/output.
- `TransactionIR`: canonical transaction model used for validation, conversion, code generation, and text renderers.
- `PTBGraph`: graph document model used for visual editing and persistence.

Mermaid output should be generated from `TransactionIR`, not from React Flow screen state.

Target conversion direction:

```mermaid
flowchart TD
  raw["RawProgrammableTransaction"] --> ir["TransactionIR"]
  ir --> raw
  graph["PTBGraph"] --> ir
  ir --> graph
  ir --> mermaid["Mermaid"]
  ir --> code["TS SDK code"]
  builder["ptb-builder UI"] <--> graph
```

Rules:

- Keep `TransactionIR` and `PTBGraph` separate unless implementation evidence proves one structure can replace the other cleanly.
- Do not treat React Flow positions, handles, viewport state, collapsed state, or UI layout as transaction semantics.
- Keep file/document format and file-to-graph conversion in `@zktx.io/ptb-model`. Builder code should call model utilities and then render or edit the resulting `PTBGraph`; it must not own parallel document conversion rules.
- Keep legacy migration separate from normal model parsing and out of `@zktx.io/ptb-builder`. New canonical parsers should reject legacy shapes. The only allowed compatibility bridge is an explicitly named PTB flow compatibility utility or separate migration tool, outside the normal `@zktx.io/ptb-model` parser/converter/validator path, and it must not be invoked implicitly by canonical model APIs.
- Include Sui `FundsWithdrawal` in raw PTB coverage.
- Do not treat SDK builder conveniences such as `$Intent`, `UnresolvedPure`, or `UnresolvedObject` as canonical raw PTB commands.
- Mermaid, TypeScript SDK code strings, raw PTB conversion, and runtime adapters should use `TransactionIR` as their transaction-semantics input unless implementation evidence proves a different boundary is safer.

## Scope Interpretation

Do not interpret a user request as the lowest-effort literal edit that could satisfy the words in isolation. Interpret it by the product outcome the user is trying to make true, the affected boundary, and the adjacent invariants that must hold for the work to be complete.

Think broadly before acting deliberately. The final implementation should be the quality-first complete change for the verified boundary. Optimize for correctness, maintainability, shared invariants, failure handling, docs, tests, and user-facing behavior. Prefer shorter or simpler code only when it preserves the same behavior, safety, and clarity. Do not optimize for the fewest edited lines, shallow reasoning, reduced investigation, or an incomplete fix. Before deciding the boundary is complete, inspect the related callers, callees, schemas, docs, tests, user flows, failure modes, and product claims that could be affected.

When a request points to a specific file, line, review comment, or symptom, do not start by editing that spot. First inspect the adjacent callers, callees, schemas, docs, tests, user flows, failure modes, and shared invariants. Then collect the verified issues, decide the best improvement plan for the affected boundary, and edit according to that plan. If inspection shows the pointed-at spot is the only affected boundary, state that finding and keep the edit narrow.

Elegance is part of quality only when it makes product rules easier to verify and maintain. Prefer elegant structure after correctness, explicit boundaries, failure handling, numeric and unit safety, tests, and user-facing consistency are preserved. Do not choose abstraction, brevity, symmetry, or aesthetic neatness when it hides invariants, weakens evidence, obscures failure paths, or makes the product boundary less explicit.

If a literal reading would leave the stated goal unmet, leave a shared invariant broken, or make code, docs, tests, and product behavior disagree, reject that reading. Fix the connected issue in the same change when it is safe and part of the affected boundary; otherwise state the specific boundary that requires a separate plan.

Do not use boundary control as an excuse to avoid necessary investigation. Do not use broad investigation as an excuse to expand product authority, add unrelated features, or delay a safe fix. Rich reasoning is required; final communication should remain concise and evidence-based.

## Development Discipline

For every task:

0. Open and read `AGENTS.md` from disk before starting. Do not rely on memory, previous turns, or summaries as a substitute.
1. Inspect the current repository state first.
2. Identify affected files, modules, interfaces, user flows, docs, package exports, generated artifacts, and examples.
3. Check whether a source-of-truth implementation already exists before adding a function, type, script, adapter, renderer, registry entry, or conversion helper. In this repository, source of truth means an existing shared local module, `@zktx.io/ptb-model`, the pinned SDK/source API, or verified Sui source depending on the boundary.
4. Reuse existing source-of-truth code when it exists. Do not create a parallel helper with similar responsibility unless the existing source is demonstrably wrong or too limited for the verified boundary.
5. Add new code only when no suitable source exists or the existing source is demonstrably insufficient.
6. Do not duplicate existing logic, registries, protocol metadata, conversion rules, validation rules, renderer rules, or SDK-shape normalization without a clear reason.
7. Make the quality-first complete change that satisfies the goal after the affected boundary is understood. Do not make symptom-only patches that leave the same invariant broken on adjacent paths.
   Evaluate planning and implementation units by dependency and logical cohesion, not by diff size, file count, or phase count. Group strongly dependent work into one coherent change when the pieces must be completed together to preserve the same product boundary, shared invariant, failure handling, docs, tests, public exports, or user-facing behavior. When two implementations satisfy the same behavior and quality bar, prefer the shorter and simpler one.
8. After the change, re-check every affected area.
9. Run relevant checks, tests, builds, pack dry-runs, or manual verification when available.
10. Fix errors or regressions caused by the change before calling the work complete.

If a check cannot be run, state that fact and the remaining risk.

Do not declare a blocker until the relevant source, callers, failure path, and available verification have been checked. If a blocker remains, state the concrete evidence and the next required decision or dependency.

Function and program structure:

- Prefer simple, direct structure with locally understandable control flow and only the moving parts justified by the verified boundary. When two structures preserve the same behavior, safety, and clarity, choose the shorter and simpler one.
- Use existing source-of-truth modules and established infrastructure when they already own the boundary. Do not duplicate shared rules just to make one local function look cleaner.
- Add a helper or abstraction only when it names a real shared concept, preserves an invariant, or removes meaningful repetition.
- Avoid premature class hierarchies, generic frameworks, new registries, plugin layers, event buses, background schedulers, callback/subscription systems, or other coordination machinery unless the current verified requirement needs them, including failure paths, lifecycle cleanup, and observability.
- Simple never means hardcoded, temporary, case-specific, or test-only code. A simple implementation must still validate inputs and outputs, handle cleanup and errors, preserve shared invariants, and cover affected state paths with tests.

Use `apply_patch` for manual file edits. Do not revert unrelated user changes.

## Review Discipline

The goal of review is defect discovery, not praise or consensus. Do not defend an implementation; verify whether code, docs, tests, package exports, examples, and product boundaries actually agree.

- Report findings first, ordered by severity.
- Each finding cites a file and line as evidence.
- Check actual code behavior instead of trusting comments.
- Mark speculation clearly when evidence is incomplete.
- Do not defer with "can be done later." If a defect can be fixed safely now within the current affected boundary, classify it as fix-now.
- Do not rely on existing tests passing as proof of correctness. Walk through every input, state, conversion, rendering, and error path the change touches.
- When a defect is found, expand the search to callers, callees, and adjacent boundaries. Trace upstream until the shared rule, type, schema, or invariant the defect violates is identified. Do not stop because the related code is outside the current task scope or outside the diff under review.

When findings reveal structural problems, also describe how the feature would be designed from scratch with no legacy constraints, optimizing for long-term maintainability and against code complexity and fragmentation. Include the prerequisite work that should have existed before implementation. Present the result as one connected design, starting from the type dependency graph and explicit separation of boundaries and responsibilities, not as a stage-by-stage list.

## Implementation Integrity

- Do not hardcode values to bypass real validation, SDK compatibility, graph semantics, raw PTB semantics, package metadata, or Sui source checks.
- Do not add temporary branches solely to satisfy one failing case.
- Do not manipulate tests, fixtures, generated files, snapshots, package metadata, source files, or examples just to make checks pass.
- Test doubles, fixtures, placeholders, and config constants are allowed only when their scope is explicit and they are not presented as product functionality.
- Do not fake transactions, object refs, package IDs, digests, BCS bytes, Mermaid support, SDK helper support, wallet state, simulation support, signing readiness, or network support.
- If technical debt remains, name it explicitly and explain why it is not being removed now.
- Prefer removing avoidable debt in the same change when it is safe and within the affected boundary.

## PTB, Numeric, And Protocol Honesty

Treat PTB data as protocol-facing data, even when it is shown in a UI or rendered as text.

- Treat raw amounts, display values, gas references, object IDs, object versions, object digests, type tags, BCS bytes, module bytes, package IDs, command result indexes, nested result indexes, and transaction arguments as safety-critical data.
- Keep raw amounts, object versions, gas values, and protocol integer values as integer strings or `BigInt` values when precision matters. Do not use floating point `number` arithmetic for signable quantities or protocol integers.
- Keep display values presentation-only and label them as display data. Do not feed display strings back into raw PTB conversion or code generation without an explicit conversion step.
- Do not infer token decimals, type tags, object ownership, shared-object metadata, receiving-object status, or package metadata from symbols, UI labels, memory, or convenience defaults. Use a verified source of truth such as pinned SDK/source data or verified Sui source.
- Separate raw PTB, TransactionIR, PTBGraph, React Flow screen state, Mermaid output, TypeScript SDK code strings, and runtime `Transaction` objects in types, docs, and user-facing explanations. Do not let one category masquerade as another.
- Use Sui and SDK terms as the protocol or SDK defines them. If PTB Builder uses a product label for clarity, keep the canonical protocol term traceable in code, docs, or evidence notes.
- If a protocol, SDK, or source file does not define a term, quantity, status, or behavior clearly enough, mark it as unsupported, unavailable, or requiring verification. Do not fill the gap with imagination or confident prose.

## Product Rules

- Keep PTB authoring and transaction authorization separate.
- PTB Builder may help users build, inspect, render, and edit PTB data, but host applications own wallet connection, signing, simulation, execution, custody, and final transaction authorization.
- Do not pass generated TypeScript code strings or decoded transaction data as trusted signing material.
- Keep unsupported Sui PTB shapes clearly unsupported. Do not add unimplemented action types, raw variants, graph semantics, or renderer claims in code or docs.
- Prefer read-only inspection and deterministic conversion before adding write, signing, simulation, or execution behavior.
- `@zktx.io/ptb-model` must remain UI-independent and runtime-execution-independent unless a new explicit decision replaces that boundary.
- `@zktx.io/ptb-builder` public exports and CSS export paths must remain compatible unless the task explicitly allows a breaking change. This compatibility rule applies to the builder package; it must not weaken or fork the canonical model boundary.

## Network And SDK Policy

JSON-RPC use is forbidden for new implementation. Do not add `@mysten/sui/jsonRpc`, `SuiJsonRpcClient`, `getJsonRpcFullnodeUrl`, JSON-RPC endpoints, or JSON-RPC API calls. Existing JSON-RPC paths are technical debt to replace with gRPC/Core API or another verified non-JSON-RPC path.

When chain reads, transaction fetching, object fetching, package fetching, or live examples are needed, prefer verified `@mysten/sui` v2 Core/gRPC APIs supported by the installed SDK source. Do not guess method names.

Internal experiments may use testnet, but product docs, package descriptions, public examples, and supported-feature claims must not silently present testnet-only behavior as mainnet-ready product functionality. If a testnet fixture is used in tests or examples, label it as test-only.

Do not silently substitute mainnet assets, packages, objects, type tags, or transaction digests. Resolved assets, packages, objects, functions, and command shapes must be shown explicitly when they affect the review or rendering output.

## Generated And Package Files

- Generated package outputs under `dist/` are build artifacts. Do not hand-edit them unless a file is explicitly marked as manual.
- Commit lockfile changes when dependency metadata changes.
- If package exports, CSS export paths, files lists, side effects, or peer dependencies change, verify package build output and run a relevant pack dry-run when practical.
- If generated or decoded fixture data changes, update related tests/docs or state why no doc change is needed.

## Dependency Policy

- Pin Sui, wallet, React Flow, and builder/model boundary dependencies intentionally during active development.
- Do not upgrade SDKs casually.
- If an SDK is upgraded, inspect the SDK source for affected transaction structures, helper names, Core/gRPC APIs, and serialized PTB shapes.
- After an SDK upgrade, re-run affected model conversion, builder load/render/runtime adapter, example, package build, and registry/fixture checks when available.

## Completion Criteria

Work is complete only when:

- The requested change is implemented, not merely planned or reported.
- The affected boundary still looks robust when reviewed again from the product purpose, code paths, PTB data boundaries, user flows, tests, package exports, examples, and documentation.
- Affected code, docs, interfaces, package exports, examples, and user flows have been reviewed after the change.
- Relevant checks, tests, builds, pack dry-runs, or manual verification have been run when available.
- Errors introduced by the change have been fixed.
- Remaining limitations are explicitly documented.

If implementation cannot be completed, the blocker must be concrete: cite the source checked, the failure path, the command or evidence observed, and the next required decision or dependency.
