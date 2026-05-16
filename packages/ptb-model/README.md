# @zktx.io/ptb-model

UI-independent Sui Programmable Transaction Block model utilities.

`@zktx.io/ptb-model` owns the logical transaction data boundary used by PTB Builder:

- normalize Sui PTB-shaped raw data into `TransactionIR`;
- convert between `TransactionIR` and `PTBGraph`;
- validate transaction references and unsupported input shapes;
- render `TransactionIR` to Mermaid;
- render `TransactionIR` to a TypeScript SDK transaction-building code string.

It is separate from `@zktx.io/ptb-builder`, which owns the React UI and runtime integration.

## Boundaries

This package does not provide:

- React or React Flow components;
- DOM or CSS;
- wallet connection, signing, simulation, or execution;
- network clients or RPC calls;
- runtime Sui `Transaction` construction.

`@mysten/sui` is used only as a development-time source of truth for SDK compatibility. The runtime package surface is pure TypeScript data conversion and text rendering. It does not draw UI or depend on a UI framework.

This package must not use JSON-RPC APIs such as `@mysten/sui/jsonRpc`, `SuiJsonRpcClient`, or `getJsonRpcFullnodeUrl`.

## Public Surface

Import from the package root only:

```ts
import { rawTransactionToIR, transactionIRToGraph } from '@zktx.io/ptb-model';
```

The package export map exposes only `@zktx.io/ptb-model`. Subpath imports are
not public API.

The root entrypoint exposes:

- canonical data types for documents, raw PTB data, `TransactionIR`, and `PTBGraph`;
- validation and diagnostic helpers;
- raw/IR/graph conversion functions;
- Mermaid and TypeScript SDK code string renderers;
- scalar and byte normalizers needed before constructing model values;
- `NULL_VALUE`, the canonical JSON-stable representation for `option<T>` `None`.

It does not expose:

- React, React Flow, DOM, CSS, or builder UI helpers;
- wallet, signer, client, simulation, execution, or runtime `Transaction` adapters;
- document-version conversion utilities or compatibility parsers in the canonical parser path;
- package subpaths as supported imports.

## Data Model

The package keeps three data structures separate:

- `RawProgrammableTransaction`: normalized Sui PTB-shaped input/output.
- `TransactionIR`: canonical transaction model for validation, conversion, and renderers.
- `PTBGraph`: graph document model for visual editing and persistence.

```mermaid
flowchart TD
  raw["RawProgrammableTransaction"]:::raw --> ir["TransactionIR"]:::ir
  ir --> raw
  graph["PTBGraph"]:::graph --> ir
  ir --> graph
  ir --> mermaid["Mermaid"]:::render
  ir --> code["TS SDK code string"]:::render

  classDef raw fill:#eff6ff,stroke:#2563eb,color:#111827
  classDef ir fill:#ecfdf5,stroke:#059669,color:#064e3b
  classDef graph fill:#fff7ed,stroke:#ea580c,color:#7c2d12
  classDef render fill:#f5f3ff,stroke:#7c3aed,color:#3b0764
```

`PTBGraph` is not React Flow state. Screen positions, collapsed state, and viewport state are not transaction semantics. Port handles are stable graph-model identifiers, not React Flow layout state.

Conversion outputs are detached for JSON-like PTB data. Mutating a raw or graph value returned by this package should not mutate the source `TransactionIR`. `PTBDocV4.modules`, `PTBDocV4.objects`, graph variable values, and `Unsupported.value` are expected to hold JSON-like data; exotic class instances in those extension channels are outside that guarantee and may be returned by reference.

## Supported Raw PTB Surface

Canonical raw inputs:

- `Pure`
- `Object`
- `FundsWithdrawal`

Canonical object inputs:

- `ImmOrOwnedObject`
- `SharedObject`
- `Receiving`

Canonical commands:

- `MoveCall`
- `TransferObjects`
- `SplitCoins`
- `MergeCoins`
- `Publish`
- `MakeMoveVec`
- `Upgrade`

SDK builder convenience shapes such as `$Intent`, `UnresolvedPure`, and `UnresolvedObject` are not canonical raw PTB. They produce diagnostics instead of being silently accepted. `Transaction.serialize()` can preserve unresolved builder objects; use resolved transaction-kind data when the host needs canonical raw PTB.

## Unsupported Surface And Boundary Limitations

- `parsePTBDocV4()` accepts only the `ptb_4` document version.
- Raw PTB, `TransactionIR`, `PTBGraph`, and `PTBDocV4` shapes are closed at
  their model boundary. Fields not defined by the exported model types or the
  verified SDK raw PTB schema produce diagnostics instead of being silently
  preserved or ignored.
- SDK builder convenience shapes such as `$Intent`, `UnresolvedPure`, and `UnresolvedObject` are not canonical raw PTB.
- `PTBGraph` does not preserve SDK metadata fields such as `_argumentTypes` and `Argument.Input.type` through graph round-trips. Use raw/IR/raw conversion when SDK metadata fidelity matters.
- Extra fields inside SDK `_argumentTypes` metadata are rejected. A signature
  with hidden fields turns the containing MoveCall into `Unsupported` and emits
  a `raw.command.moveCall.argumentTypes` diagnostic. The field must match the
  exported `RawOpenSignature` shape exactly.
- `CommandNode.params.runtime` is the only graph command parameter section that
  can provide transaction semantics. `params.ui` is display-only and
  closed-shape; both sections use exported closed TypeScript shapes and
  command-specific runtime key validation. Builder-shaped sections such as
  `params.moveCall` are rejected as unknown fields.
- Sponsor `FundsWithdrawal` is preserved in raw, IR, graph, and Mermaid inspection paths, but TS SDK code string rendering rejects it because the public `@mysten/sui@2.16.2` transaction helper surface cannot represent it honestly.
- Empty raw Pure byte strings are accepted at the raw byte layer because the installed SDK byte schema and decoder accept them. This package does not infer the consuming Move type for raw Pure bytes.
- `IRPureValue` may contain `bigint` for typed pure code generation; use `jsonStringifyWithBigInt()` when serializing such IR values to JSON text.
- Runtime `Transaction` construction, wallet connection, signing, simulation, execution, network clients, and JSON-RPC APIs are outside this package.

## Raw Scalar Policy

Raw PTB parsing normalizes protocol integer fields before they enter `TransactionIR`.
`JsonU64` strings must be non-empty, accepted by `BigInt(value)`, and within
`0..=18446744073709551615`. `TransactionIR` stores accepted values as decimal
strings. Number inputs are intentionally stricter than the SDK schema and are
accepted only when they are safe JavaScript integers; callers should use strings
for protocol integers outside that safe range. Empty strings are rejected at the
model boundary instead of being coerced to zero.

`Base64Bytes` acceptance follows the SDK's `fromBase64()` behavior, which uses
global `atob`. Pure input bytes and Publish/Upgrade module bytes must be
atob-decodable strings. `TransactionIR` stores accepted bytes with ASCII
base64 whitespace removed so equivalent byte strings compare the same. Invalid
module bytes are reported at the failing array element path. The exported
`parseBase64Bytes()` helper requires `globalThis.atob`; it returns `undefined`
when no compatible decoder is available.

Object IDs and package IDs follow the SDK `SuiAddress`/`ObjectID` schema and are
normalized to 32-byte `0x`-prefixed lowercase hex strings. Object digests are
kept as strings because the installed SDK raw schema treats them as strings.
Move type tags and MoveCall module/function identifiers remain separate
validation boundaries.

The local address normalizer mirrors `@mysten/sui@2.16.2`
`packages/sui/src/utils/sui-types.ts` so this package can stay free of runtime
SDK dependencies. Re-check that mirror whenever the target SDK version changes.

Sui source validity rules are enforced where they do not require live
`ProtocolConfig`: `TransferObjects.objects`, `SplitCoins.amounts`,
`MergeCoins.sources`, and Publish/Upgrade module arrays must be non-empty.
`MakeMoveVec` may be empty only when an explicit type is present. Protocol
size limits and config-dependent Move identifier checks are left to the host
application or Sui execution/simulation layer.

`RawCommand.Upgrade` uses the installed SDK command field name `package`.
`packageId` command payloads are not accepted by the canonical raw parser;
convert them before calling `rawTransactionToIR()`.

`rawTransactionToIR()` may read SDK `TransactionData` v2 envelopes when
they contain `inputs` and `commands`, but the model boundary is the PTB program
itself. Envelope fields such as `sender`, `expiration`, and `gasData` are
accepted only as SDK envelope context and are not preserved by
`TransactionIR` or emitted by `transactionIRToRaw()`.

SDK raw metadata fields `Argument.Input.type` and MoveCall `_argumentTypes` are
preserved during raw/IR/raw conversion when present. `_argumentTypes` must match
the exported `RawOpenSignature` shape, which mirrors the installed SDK
`OpenSignature` shape and adds model constraints such as non-negative type
parameter indexes and no unsupported fields. These fields are SDK metadata, not
transaction semantics, and renderers do not infer protocol meaning from them.
`PTBGraph` is the visual editing model and does not preserve those metadata
fields through graph round-trips; use the raw/IR boundary when SDK metadata
fidelity matters.

When a `PTBGraph` declares flow nodes or flow edges, validation requires a
single Start-to-End flow path containing every command node. Graph fragments
without flow are still accepted for programmatic construction. Flow edges are
transaction-order graph semantics; positions and viewport data are layout only.
Variable `rawInput` values must already be canonical raw inputs. "Canonical"
means the value already equals the corresponding parser result: object and
package IDs are normalized 32-byte `0x`-prefixed lowercase hex, `JsonU64` values
are decimal strings, and base64 bytes contain no ASCII whitespace. Graph command
runtime params for MoveCall targets and type arguments, package IDs,
dependencies, module bytes, and MakeMoveVec explicit types are transaction
inputs; UI params are never read as transaction semantics. Value-only object
variables are a separate graph convenience and emit
`graph.input.object.unresolved` when they cannot be resolved into raw PTB object
inputs. Mermaid rendering shows diagnostics for invalid references and omits
edges whose source node does not exist.

The scalar normalizers, SDK metadata guard, and diagnostic freezer are exported for host-side
validation before creating raw or graph values: `parseJsonU64()`,
`parseBase64Bytes()`, `parseObjectId()`, and
`isRawInputArgumentType()`, `isRawMoveCallArgumentTypes()`, and
`freezeDiagnostics()`.

## Basic Usage

```ts
import {
  rawTransactionToIR,
  transactionIRToGraph,
  transactionIRToMermaid,
  transactionIRToRaw,
} from '@zktx.io/ptb-model';

const ir = rawTransactionToIR({
  inputs: [{ kind: 'Pure', bytes: 'AQID' }],
  commands: [
    {
      kind: 'SplitCoins',
      coin: { kind: 'GasCoin' },
      amounts: [{ kind: 'Input', index: 0 }],
    },
  ],
});

if (ir.diagnostics.length > 0) {
  throw new Error('Invalid PTB input');
}

const graph = transactionIRToGraph(ir);
const mermaid = transactionIRToMermaid(ir, {
  direction: 'LR',
  showArgumentValues: true,
  theme: 'semantic',
});
const raw = transactionIRToRaw(ir);
```

## TS SDK Code String Rendering

`transactionIRToTsSdkCode(ir)` returns a TypeScript source string. It does not create a live Sui `Transaction` object.

The generated source targets the public helper surface in `@mysten/sui@2.16.2`, including:

- `Transaction`
- `tx.objectRef(...)`
- `tx.sharedObjectRef(...)`
- `tx.receivingRef(...)`
- `tx.withdrawal(...)`

Code string rendering validates the `TransactionIR` shape and conversion requirements before rendering. Unsupported inputs, unresolved object data, and shapes that cannot be represented honestly with the public SDK helper surface throw instead of emitting incomplete or misleading code.

In particular, Sponsor `FundsWithdrawal` is preserved in raw/IR/graph/Mermaid conversion, but TS SDK code string rendering rejects it because the `@mysten/sui@2.16.2` public `Transaction.withdrawal()` helper only exposes sender withdrawal behavior.

Typed pure `option<T>` values render through `tx.pure.option(...)`. Canonical
IR and graph documents use `null` for `None`; explicit `undefined` is rejected
instead of being treated as a portable document value.

Typed pure `address` and `id` values are validated with `parseObjectId()` and
rendered in canonical 32-byte `0x`-prefixed lowercase hex form. That
normalization recursively applies to `address` and `id` leaves inside composite
pure types, such as `option<vector<address>>`. Raw PTB and graph rawInput
boundaries remain canonical-only; this normalization is the explicit TS SDK code
rendering step.

Pure inputs may use raw `bytes` or a typed (`value`, `type`) pair. Typed pure
inputs must include both fields; `option<T>` `None` must be stored as explicit
`null`. Raw `bytes` may also carry a `type` hint from graph editing, but they
must not carry a typed `value`.
`validateTransactionIR()` rejects ambiguous Pure inputs instead of letting raw,
graph, or code rendering paths silently choose one representation.

Empty base64 strings are accepted at the raw byte layer because the SDK
`BCSBytes` schema is a string and the SDK base64 decoder accepts `atob('')`.
`ptb-model` does not infer the expected Move type for raw Pure bytes; Move
argument decoding may reject the bytes when a command consumes them.

Generated code that includes raw Pure bytes uses `globalThis.atob` to decode
base64. It is intended for modern browser runtimes and Node versions that expose
`atob`.

`IRPureValue` may contain `bigint` for typed pure code generation. Use the
exported `jsonStringifyWithBigInt()` helper when serializing such IR values to
JSON text.

## Raw And Graph Conversion Rules

All model array fields must be dense JavaScript arrays. Sparse arrays are
rejected at public validation and conversion boundaries instead of being treated
as omitted elements.

`transactionIRToRaw()` emits canonical raw PTB data only. A `Pure` input must already have raw `bytes`, and an `Object` input must already have a resolved object argument. Typed pure display values can be rendered to TS SDK code when the SDK pure helper supports the type, but they are not silently BCS-encoded by this package.

`transactionIRToRaw()`, `transactionIRToGraph()`, and `transactionIRToTsSdkCode()` validate the IR shape instead of treating stored `diagnostics` as authoritative state. `transactionIRToMermaid()` preserves diagnostics in the diagram because it is an inspection renderer.

When a graph is authored manually, `rawInput` is the canonical way to represent `SharedObject`, `Receiving`, and `FundsWithdrawal` inputs. A value-only object variable is interpreted only as an owned or immutable object when it has `objectId`, `version`, and `digest`.

Gas is semantic, not name-based. A graph variable becomes `GasCoin` only when `semantic.kind` is `GasCoin`; an id or name such as `gas` is not enough.

Graph validation checks top-level graph fields, node ids, port ids, edge ids, handle existence, edge direction, edge role, and duplicate incoming command input edges before conversion. Invalid graphs return diagnostics instead of partially converting through implicit fallbacks.
It also validates optional public graph fields such as node positions, port
labels and type strings, edge casts, variable semantics, PTB type hints, and
command params. `PTBGraph` supports only `nodes` and `edges` at the graph
top level. Graph nodes, positions, ports, edges, edge casts, variable semantics,
and PTB type hint objects reject unsupported fields instead of preserving
hidden metadata. `CommandNode.params` is a closed object with only `runtime`
and `ui` sections. `runtime` is the host-provided command payload that can
define transaction semantics; `ui` is display-only. Both sections accept only
the fields declared by the exported TypeScript types and by command-specific
runtime validation. Builder-shaped sections such as `params.moveCall` are
rejected instead of being preserved.

Command input ports use canonical ids such as `in_arg_0`, `in_elem_0`, `in_amount_0`, `in_object_0`, `in_source_0`, `in_coin`, `in_destination`, `in_recipient`, and `in_upgradeCap`. Commands with exactly one known result use `out_result`. Commands with multiple known results use nested result handles such as `out_0` and `out_1`; `Result(i)` is valid only for a command with exactly one result, matching Sui execution arity checks. A nested handle for a single-result command is emitted only when an existing `NestedResult(i, 0)` reference must be preserved. Separate `outputs` arrays are not transaction semantics.

## Mermaid Rendering

`transactionIRToMermaid()` emits a Mermaid `flowchart`, not sequence or state syntax. Supported directions are `TD` and `LR`; supported themes are `none` and `semantic`.

Mermaid rendering includes validation diagnostics in the diagram and is defensive for malformed manual IR so callers can inspect problems without a `TypeError`.

Host applications can use this package as a PTB visualization adapter: convert
supported raw PTB or SDK transaction-kind data into `TransactionIR`,
then render that IR to Mermaid text for display in their own UI, documentation,
logs, or review tools. The renderer returns text only; the host application
chooses the Mermaid renderer, preview component, storage, and user workflow.

If the host already has an SDK `Transaction` object, pass `tx.getData()` to
`rawTransactionToIR()`; do not pass the live `Transaction` instance itself.

When another app starts from serialized Sui transaction data, it must first use
the Sui SDK to deserialize that data into SDK transaction-kind data, then
pass the resulting object through `rawTransactionToIR()` before calling
`transactionIRToMermaid()`. This package does not accept serialized BCS bytes,
base64 transaction strings, or live `Transaction` instances directly. For
example, a host can deserialize transaction-kind bytes with the SDK, call
`restored.getData()`, convert that value with `rawTransactionToIR()`, and render
the returned `TransactionIR` to Mermaid text. Serialized SDK builder data that
still contains unresolved convenience shapes such as `UnresolvedObject` is
reported as diagnostics instead of being treated as canonical PTB.

```ts
import { Transaction } from '@mysten/sui/transactions';
import {
  rawTransactionToIR,
  transactionIRToMermaid,
} from '@zktx.io/ptb-model';

export function transactionKindBytesToMermaid(bytes: Uint8Array): string {
  const restored = Transaction.fromKind(bytes);
  const ir = rawTransactionToIR(restored.getData());

  return transactionIRToMermaid(ir, {
    direction: 'LR',
    showArgumentValues: true,
    theme: 'semantic',
  });
}
```

The value passed to `rawTransactionToIR()` must be a supported raw PTB
object: either an object with dense `inputs` and `commands` arrays, or the
SDK transaction-kind data returned by `Transaction.fromKind(...).getData()`.

## Documents

`parsePTBDocV4()` accepts only `ptb_4` documents.

`PTBDocV4` is a closed package document shape. The supported top-level fields
are `version`, `graph`, `chain`, `sender`, `modules`, `objects`, and `view`.
Host-owned extension data should live in the explicit `modules` / `objects`
records or outside the PTBDocV4 object.

Unsupported document versions are rejected by `@zktx.io/ptb-model`. Convert
them outside this package before calling `parsePTBDocV4()`.

`detectPTBDocVersion()` reports only the canonical document version: `ptb_4`.

No document-version conversion utility is exposed by the current root API. If a
host needs to upgrade another document shape, that conversion must happen before
calling the canonical parser.

## Diagnostics

Converters return a `TransactionIR` with diagnostics. Diagnostics are part of the model boundary and should be checked before rendering, converting to raw, or generating code strings.

`transactionIRToRaw()`, `transactionIRToGraph()`, and `transactionIRToTsSdkCode()` reject IR values whose diagnostics make the requested output unsafe or misleading.

Diagnostics have a closed runtime shape: `{ code, message, path? }`. Warning-level diagnostics are not part of the model.

Package-created diagnostics are frozen at runtime. `TransactionIR.diagnostics`
is runtime-frozen when the IR is returned by package conversion functions or
created with `createTransactionIR()`; host-built `TransactionIR` literals should
use `freezeDiagnostics()` when runtime immutability matters.
`freezeDiagnostics()` validates the canonical diagnostic shape before freezing.

Stored diagnostics are not authoritative state across package upgrades. Re-run
validation after loading stored IR instead of relying on serialized diagnostic
objects.

Base64 byte validation uses base64-specific diagnostic codes so callers can
distinguish malformed byte strings from ordinary missing string-array fields.

## Development

From the repository root:

```sh
npm run test --workspace @zktx.io/ptb-model
npm run build --workspace @zktx.io/ptb-model
```

The root lint command also covers this package:

```sh
npm run lint
```
