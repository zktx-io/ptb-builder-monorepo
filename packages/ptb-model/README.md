# @zktx.io/ptb-model

UI-independent Sui Programmable Transaction Block model utilities.

`@zktx.io/ptb-model` owns the logical transaction data boundary used by PTB Builder:

- normalize Sui PTB-shaped raw data into `TransactionIR`;
- convert between `TransactionIR` and `PTBGraph`;
- validate transaction references, typed Pure values, and unsupported input shapes;
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

`@mysten/sui` is used for public SDK utility and BCS helpers that define Sui
address, object digest, and type-tag behavior. The runtime package surface is
data conversion and text rendering. It does not draw UI, depend on a UI
framework, construct runtime `Transaction` objects, connect to wallets, or use
network clients.

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
- structural IR parsing helpers and projection-specific IR validators;
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

`TransactionIR` values created from raw PTB may include `canonicalRaw` on inputs
or commands. That field is a normalized raw PTB snapshot detached from the
source raw or graph object that produced the IR item. In structural IR created
by this package, `canonicalRaw` may share frozen nested objects or arrays with
the containing input or command semantic fields. Treat structural IR as an
immutable snapshot, not as mutable editing state. When `canonicalRaw` is absent,
the item was synthesized from graph or manual IR data rather than directly from
raw PTB. `validateTransactionIR()` rejects a `canonicalRaw` value that does not
match the canonical raw PTB payload represented by its containing input or
command.

`StructuralTransactionIR` means the IR has passed shape, reference, semantic
argument, Pure-value, and `canonicalRaw` consistency checks and has been
deep-frozen by this package. It does not mean the IR can be rendered to every
projection. Unsupported inputs or commands may still be present for inspection
and graph round-trips. Use `validateTsSdkRenderableIR()` /
`assertTsSdkRenderableIR()` before TS SDK code generation or runtime adapter
construction, and use `validateRawConvertibleIR()` / `assertRawConvertibleIR()`
before raw PTB conversion. `parseStructuralTransactionIR()` clones host-provided
IR before freezing it; `createTransactionIR()` only creates a frame and freezes
diagnostics, so it does not produce a structural fast-path value.
Serialization or `structuredClone()` removes this package's structural brand.
Validate cloned or deserialized IR again before relying on projection fast paths.

Parsed documents are detached only after the whole document is validated as JSON-like data. `parsePTBDocV4()` rejects exotic class instances, sparse arrays, and cyclic references in `modules`, `objects`, graph values, and other document fields. Direct in-memory conversion helpers also detach arrays and plain objects for graph variable values and `Unsupported.value`; non-plain objects passed directly to those helpers are outside the JSON-like guarantee and may be returned by reference.

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
- Sponsor `FundsWithdrawal` is preserved in raw, IR, graph, and Mermaid inspection paths, but TS SDK code string rendering rejects it because the public `@mysten/sui` transaction helper surface cannot represent it honestly.
- Empty raw Pure byte strings are accepted at the raw byte layer because the installed SDK byte schema and decoder accept them. This package does not infer the consuming Move type for raw Pure bytes.
- `IRPureValue` may contain `bigint` for typed pure code generation; use `jsonStringifyWithBigInt()` when serializing such IR values to JSON text.
- Runtime `Transaction` construction, wallet connection, signing, simulation, execution, network clients, and JSON-RPC APIs are outside this package.

## Raw Scalar Policy

Raw PTB parsing normalizes protocol integer fields before they enter `TransactionIR`.
`JsonU64` strings must already be canonical decimal strings: either `0` or a
non-zero decimal string with no sign, whitespace, hex prefix, decimal point,
exponent, or leading zero. Accepted values must fit
`0..=18446744073709551615`, and `TransactionIR` stores them as decimal strings.
JavaScript `number` inputs are accepted only when they are safe non-negative
integers and are converted to decimal strings. Callers should use strings for
protocol integers outside the safe integer range.

`Base64Bytes` acceptance follows the installed SDK's base64 byte behavior. Pure
input bytes and Publish/Upgrade module bytes must be base64-decodable strings.
`TransactionIR` stores accepted bytes with ASCII base64 whitespace removed and
re-encoded through the SDK base64 encoder so equivalent byte strings compare the
same. Raw PTB parsing may accept non-canonical but SDK-decodable base64 text and
store the SDK-canonical base64 result; graph `rawInput`, `canonicalRaw`, and IR
command byte arrays must already be in that canonical form. Invalid module bytes
are reported at the failing array element path. The exported
`parseBase64Bytes()` helper uses the SDK decoder when available and falls back to
a standard Node `Buffer` decoder before returning SDK-canonical base64 text.

Object IDs and package IDs follow the SDK `SuiAddress`/`ObjectID` schema and are
normalized to 32-byte `0x`-prefixed lowercase hex strings. Inputs must include
an explicit `0x`/`0X` prefix; canonical output always uses lowercase `0x` and
lowercase hex digits. Empty strings, bare `0x`, and prefixless hex strings are
rejected instead of being coerced to another address. Object digests follow the
SDK `ObjectDigest` base58 schema and must decode to 32 bytes. MoveCall
module/function values must be ASCII Move identifiers following the Sui Move
identifier rule and the configured Sui verifier length limit. Move type tags are
pre-screened for full-input syntax, validated with the installed SDK's type-tag
parser, and stored in canonical form after raw or graph conversion. Address
components inside type tags follow the same `0x`/`0X` input and lowercase
canonical-output rule. `signer` type tags are not accepted in canonical PTB
type-tag fields.

Address, object digest, and Move type-tag checks call the installed
`@mysten/sui@2.16.2` public utility and BCS helpers directly. The helper-backed
normalizers are `parseObjectId()`, `parseObjectDigest()`, and
`parseMoveTypeTag()`.

Sui source validity rules are enforced where they do not require live
`ProtocolConfig`: `TransferObjects.objects`, `SplitCoins.amounts`,
`MergeCoins.sources`, and Publish/Upgrade module arrays must be non-empty.
`MakeMoveVec` may be empty only when an explicit type is present. Command
arguments that reference `Input` values must refer to the expected raw input
class when the command shape defines one, for example transfer recipients and
coin split amounts use pure inputs while coin/object arguments use object
inputs. Result and nested-result references remain structurally validated
because their precise Move value type can depend on prior commands or package
metadata. Protocol size limits and config-dependent Move identifier checks are
left to the host application or Sui execution/simulation layer.

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
the exported `RawOpenSignature` shape, which is checked against the installed
SDK `OpenSignature` payload shape and adds model constraints such as non-negative type
parameter indexes and no unsupported fields. These fields are SDK metadata, not
transaction semantics, and renderers do not infer protocol meaning from them.
`PTBGraph` is the visual editing model and does not preserve those metadata
fields through graph round-trips; use the raw/IR boundary when SDK metadata
fidelity matters.

When a `PTBGraph` declares flow nodes or flow edges, validation requires a
single Start-to-End flow path containing every command node. Graph fragments
without flow are accepted for programmatic construction. Flow edges are
transaction-order graph semantics; positions and viewport data are layout only.
Variable `rawInput` values must already be canonical raw inputs. "Canonical"
means the value already equals the corresponding parser result: object and
package IDs are normalized 32-byte `0x`-prefixed lowercase hex, `JsonU64` values
are decimal strings, object digests are SDK-valid base58 32-byte digests, and
base64 bytes contain no ASCII whitespace. Graph command runtime params for
MoveCall targets and type arguments, package IDs, dependencies, module bytes,
and MakeMoveVec explicit types are transaction inputs; UI params are never read
as transaction semantics. Value-only object variables are a separate graph
convenience and emit
`graph.input.object.unresolved` when they cannot be resolved into raw PTB object
inputs. Mermaid rendering shows diagnostics for invalid references and omits
edges whose source node does not exist.

Graph `rawInput` values are closed-shape canonical raw inputs. Pure `rawInput`
cannot also carry a typed graph `value`. Object and `FundsWithdrawal` rawInput
may carry a graph `value` only when that value structurally equals the canonical
raw payload.

The scalar normalizers, SDK metadata guard, and diagnostic freezer are exported
for host-side validation before creating raw or graph values:
`parseJsonU64()`, `parseBase64Bytes()`, `parseObjectId()`,
`parseObjectDigest()`, `parseMoveIdentifier()`, `parseMoveTypeTag()`,
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

In particular, Sponsor `FundsWithdrawal` is preserved in raw/IR/graph/Mermaid conversion, but TS SDK code string rendering rejects it because the public `Transaction.withdrawal()` helper only exposes sender withdrawal behavior.

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
must not carry a typed `value`. When raw `bytes` carry a fixed-width scalar or
Move numeric type hint, validation checks the decoded byte length and bool byte
content. String, vector, and option byte payloads are not BCS-decoded by this
package.
`validateTransactionIR()` rejects ambiguous Pure inputs instead of letting raw,
graph, or code rendering paths silently choose one representation.

Empty base64 strings are accepted at the raw byte layer because the SDK
`BCSBytes` schema is a string and the SDK base64 decoder accepts empty strings.
`ptb-model` does not infer the expected Move type for raw Pure bytes; Move
argument decoding may reject the bytes when a command consumes them.

Generated code that includes raw Pure bytes uses `globalThis.atob` to decode
base64. Generated code is intended for runtimes that expose `atob`; the model
parser itself can validate base64 in Node environments without `atob`.
Generated string and JSON literals escape DEL, C1 control characters,
zero-width controls including WORD JOINER and the byte-order mark / zero-width
no-break space, bidirectional formatting controls, and Unicode line and
paragraph separators as `\uXXXX` sequences so invisible data is visible in the
emitted TypeScript source.

`IRPureValue` may contain `bigint` for typed pure code generation. Use the
exported `jsonStringifyWithBigInt()` helper when serializing such IR values to
JSON text.

## Raw And Graph Conversion Rules

All model array fields must be dense JavaScript arrays. Sparse arrays are
rejected at public validation and conversion boundaries instead of being treated
as omitted elements.

`transactionIRToRaw()` emits canonical raw PTB data only. A `Pure` input must already have raw `bytes`, and an `Object` input must already have a resolved object argument. Typed pure display values can be rendered to TS SDK code when the SDK pure helper supports the type, but they are not silently BCS-encoded by this package.

`transactionIRToRaw()`, `transactionIRToGraph()`, and `transactionIRToTsSdkCode()` validate the IR shape instead of treating stored `diagnostics` as authoritative state. IR values that were structurally checked by this package can skip the repeated structural validation step, but projection-specific checks still run. `transactionIRToMermaid()` preserves diagnostics in the diagram because it is an inspection renderer and does not treat structural branding as a rendering precondition.

When a graph is authored manually, `rawInput` is the canonical way to represent `SharedObject`, `Receiving`, and `FundsWithdrawal` inputs. A value-only object variable is interpreted only as an owned or immutable object when it has `objectId`, `version`, and `digest`.

Gas is semantic, not name-based. A graph variable becomes `GasCoin` only when `semantic.kind` is `GasCoin`; an id or name such as `gas` is not enough.
Variable names are optional graph labels. Empty variable names are converted to
generated IR input ids during graph-to-IR conversion. Generated ids avoid
non-empty variable names in the same executable graph so hand-authored names
such as `input_0` do not collide with unnamed variables. Non-empty duplicate
variable names are rejected because they would create duplicate IR input ids.
When a graph contains command nodes, value-only variables that are not
referenced by any command input edge are authoring state only and are omitted
from executable `TransactionIR` inputs. Variables carrying canonical `rawInput`
or unsupported-input semantics are preserved so raw PTB inspection round-trips
do not silently discard source payloads. `Input.index` values are derived for
each graph-to-IR conversion from the referenced and preserved variables in graph
order, so callers must not cache indexes across graph edits.

Graph validation checks top-level graph fields, node ids, port ids, edge ids, handle existence, edge direction, edge role, and duplicate incoming command input edges before conversion. Port ids must start with an ASCII letter and contain only ASCII letters, digits, and underscores. This keeps typed handle suffixes and UI aliases out of canonical `PTBGraph` data. Invalid graphs return diagnostics instead of partially converting through implicit fallbacks.
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
contains unresolved convenience shapes such as `UnresolvedObject` is
reported as diagnostics instead of being treated as canonical PTB.

```ts
import { Transaction } from '@mysten/sui/transactions';
import { rawTransactionToIR, transactionIRToMermaid } from '@zktx.io/ptb-model';

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
When present, `sender` must be a canonical Sui address. `chain` is a host-owned
string label; applications such as `@zktx.io/ptb-builder` may apply their own
supported-chain policy after model parsing. When present, `view.zoom` must be a
positive finite number.

Unsupported document versions are rejected by `@zktx.io/ptb-model`. Convert
them outside this package before calling `parsePTBDocV4()`.

`detectPTBDocVersion()` reports only the canonical document version: `ptb_4`.

The root API does not expose document-version conversion utilities. Convert
other document shapes before calling the canonical parser.

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
