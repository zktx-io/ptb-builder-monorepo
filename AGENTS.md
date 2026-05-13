# AGENTS.md

## Product Purpose

PTB Builder is a React/TypeScript toolkit for building, editing, inspecting, and rendering Sui Programmable Transaction Block data.

The package exists to make PTB structure easier to author and review:

- Edit PTBs through a graph UI.
- Convert between graph data and transaction-oriented data.
- Generate TypeScript SDK transaction-building code.
- Decode or load supported Sui PTB inputs into local editable structures.
- Let the host application handle wallet connection, signing, simulation, and execution.

Do not describe PTB Builder as a wallet, custody layer, transaction safety guarantee, or autonomous executor.

## Repository Facts

Inspect the repository before assuming any path, script, package, or API exists.

Current structure:

- `packages/ptb-builder/`: published package `@zktx.io/ptb-builder`.
- `packages/example/`: local Vite example app.
- `.WORK/`: ignored local investigation and planning notes.

Current source areas inside `packages/ptb-builder/src/`:

- `ptb/`: PTB document, graph, decode, registry, and adapter logic.
- `codegen/`: transaction preprocessing and TypeScript SDK code generation.
- `ui/`: React builder UI and React Flow integration.
- `styles/`: package styles and theme exports.

Planned package:

- `packages/ptb-model/`: planned `@zktx.io/ptb-model`; do not claim it exists until it is implemented.

## Commands

Check `package.json` before running commands. Do not invent scripts.

Current root commands:

- Install: `npm install`
- Build builder package: `npm run build`
- Run example after build: `npm run dev`
- Lint: `npm run lint`
- Format: `npm run format`

Current package commands:

- Builder build: `cd packages/ptb-builder && npm run build`
- Builder lint: `cd packages/ptb-builder && npm run lint`
- Example dev: `cd packages/example && npm run dev`
- Example build: `cd packages/example && npm run build`

Only say a command passed when it was actually run and observed successfully.

## Current Refactor Direction

The current direction is:

- Add a new lightweight package: `@zktx.io/ptb-model`.
- Keep the existing published package: `@zktx.io/ptb-builder`.
- Refactor `@zktx.io/ptb-builder` to use `@zktx.io/ptb-model`.

Do not create a separate `ptb-sui` package or rename the model package unless a new explicit decision replaces this one.

Use these local planning documents before changing the model boundary:

- `.WORK/PTB_MODEL_REFACTOR_DECISION.md`
- `.WORK/PTB_MODEL_DEVELOPMENT_SPEC.md`
- `.WORK/sui-mainnet-v1.71.1/`
- `.WORK/ts-sdks/`

`@zktx.io/ptb-model` should stay independent from UI runtime concerns:

- No React or React Flow.
- No DOM or CSS.
- No wallet, signer, or Sui client runtime requirement.
- No runtime `Transaction` object as a required dependency.

SDK-dependent behavior should remain in `@zktx.io/ptb-builder` or a later explicitly approved adapter package.

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
- Do not treat React Flow positions, handles, viewport state, or UI layout as transaction semantics.
- Keep legacy migration separate from normal parsing.
- New canonical parsers should reject legacy shapes; migration utilities may convert them explicitly.
- Include Sui `FundsWithdrawal` in raw PTB coverage.
- Do not treat SDK builder conveniences such as `$Intent`, `UnresolvedPure`, or `UnresolvedObject` as canonical raw PTB commands.

## Sui And SDK Evidence

For Sui behavior, use verified sources:

- current installed dependency behavior;
- downloaded Sui source in `.WORK/sui-mainnet-v1.71.1/`;
- downloaded TypeScript SDK source in `.WORK/ts-sdks/`;
- official Sui docs or source when local evidence is insufficient.

Do not guess SDK function names, transaction structures, JSON-RPC/Core API behavior, or version differences.

The current builder package uses `@mysten/sui` as a peer dependency. Do not upgrade it casually. If a Sui SDK upgrade is part of the task, document why, update dependency metadata intentionally, and run affected checks.

JSON-RPC sunset is an active compatibility risk. For new chain-read work, prefer the verified gRPC/Core API direction when the SDK supports it.

## Development Rules

For every task:

1. Read this file from disk first.
2. Inspect current code and package metadata before planning.
3. Use `rg` or `rg --files` for searches when available.
4. Prefer existing source-of-truth modules over adding parallel helpers.
5. Preserve `@zktx.io/ptb-builder` public exports and CSS export paths unless the task explicitly allows a breaking change.
6. Keep changes scoped to the verified boundary.
7. Update examples or docs when public behavior changes.
8. Run relevant build, lint, test, or manual verification when practical.

Use `apply_patch` for manual file edits. Do not revert unrelated user changes.

## Review Rules

When asked for a review:

- Report findings first, ordered by severity.
- Cite file and line evidence.
- Check actual code behavior instead of trusting comments.
- Mark speculation clearly when evidence is incomplete.
- If no issues are found, say so and name any remaining verification gap.

## Completion Criteria

Work is complete only when:

- The requested change is implemented or the blocker is clearly stated.
- Affected code, docs, exports, and examples have been checked.
- Relevant verification has been run or explicitly skipped with reason.
- Remaining limitations are stated clearly.
