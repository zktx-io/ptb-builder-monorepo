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

Model APIs define canonical PTB data contracts. Downstream packages such as
builder UIs, CLIs, examples, and host applications must adapt to those contracts.
Backward compatibility with older model releases, saved fixtures, or downstream
consumer habits is not a model-package design goal during this refactor because
this package is the repository's PTB source-of-truth layer consumed primarily by
`@zktx.io/ptb-cli` and `@zktx.io/ptb-builder`, not a broad stable user-facing
import API. This package should not grow aliases, fallback parsing, graph repair
paths, deprecated duplicate fields, or legacy compatibility branches only
because a consumer currently emits a different shape.

Legacy PTB flow or document compatibility, if needed, belongs in an explicitly
named compatibility utility or migration tool that converts older shapes into
the canonical model contract. That utility must stay outside the normal parser,
validator, converter, graph, renderer, and SDK-code paths, and canonical model
APIs must not invoke it silently.

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
- the pure type-name helper used by SDK-facing adapters;
- Move function signature evidence types and guards for host-provided package
  metadata;
- canonical graph handle helpers and protocol index/result-count limit helpers;
- scalar and byte normalizers needed before constructing model values;
- `NULL_VALUE`, the canonical JSON-stable representation for `option<T>` `None`.

It does not expose:

- React, React Flow, DOM, CSS, or builder UI helpers;
- wallet, signer, client, simulation, execution, or runtime `Transaction` adapters;
- document-version conversion utilities, PTB flow compatibility utilities, or compatibility parsers in the canonical parser path;
- package subpaths as supported imports.

## Canonical Consumer Usage

Consumers should treat this package as the source of truth for PTB data shapes,
graph handles, validation rules, and SDK-facing type helpers. Do not copy these
rules into a downstream package. Import the model helper and call it where the
consumer constructs or interprets model data.

Use the root export for graph handles instead of hard-coded strings:

```ts
import {
  RESULT_HANDLE_ID,
  indexedInputHandle,
  inputHandle,
  nestedResultHandle,
} from '@zktx.io/ptb-model';

const coin = inputHandle('coin'); // "in_coin"
const firstAmount = indexedInputHandle('amount', 0); // "in_amount_0"
const firstMoveType = indexedInputHandle('type', 0); // "in_type_0"
const singleResult = RESULT_HANDLE_ID; // "out_result"
const firstNestedResult = nestedResultHandle(0); // "out_0"
```

The helper output is the canonical `PTBGraph` handle id. UI frameworks may add
their own screen-state handles while rendering, but persisted `PTBGraph` data and
graph-to-IR inputs must use the model handles without React Flow suffixes,
builder aliases, or legacy names.

Use `pureTypeName()` from the root export in SDK-facing adapters instead of
re-implementing the type-name mapping:

```ts
import { pureTypeName } from '@zktx.io/ptb-model';
import type { PTBType } from '@zktx.io/ptb-model';

export function sdkPureType(type: PTBType | undefined): string | undefined {
  return pureTypeName(type);
}
```

`CommandUIParams` is display-only and currently allows only command-owned count
fields:

| Command | UI field |
| --- | --- |
| `splitCoins` | `amountsCount` |
| `mergeCoins` | `sourcesCount` |
| `transferObjects` | `objectsCount` |
| `makeMoveVec` | `elemsCount` |

Use `validatePTBType()` for standalone model type validation. It reports
model-wide `ptb.type.*` diagnostics. Graph validation and graph conversion still
report `graph.type.*` diagnostics for graph-authored `varType` and port
`dataType` fields so graph source diagnostics remain clearly attributable to
the graph layer. Object PTB type hints may omit `typeTag`; when present,
`typeTag` must be accepted by `parsePTBObjectTypeTagCandidate()`. This parser
accepts canonical struct tags that can be object-type hints and rejects
primitives, vectors, and model-known non-object structs such as
`0x1::string::String`, `0x2::object::ID`, `0x2::object::UID`,
`0x1::option::Option`, `0x1::option::Option<T>`, and
`0x2::tx_context::TxContext`.
Validators report these as object type-tag diagnostics when they are supplied
as `PTBType.object.typeTag`; signature helpers represent unsupported known
non-object structs as `unknown` PTB types.

Use the Move signature evidence guards when a host has fetched package metadata
and wants to pass that verified metadata into later model validation steps. The
model does not fetch package data. Evidence must be keyed by canonical package
id, module name, and function name, and each function signature must use
SDK-shaped `RawOpenSignature` arrays with top-level `TxContext` parameters
already removed:

```ts
import {
  analyzePTBGraph,
  graphToTransactionIR,
  isMovePackageSignatureEvidence,
  isTxContextOpenSignature,
  parseExecutableGraph,
  toPTBTypeFromConcreteTypeArgument,
  toPTBTypeFromOpenSignature,
  validateTransactionIR,
  type MovePackageSignatureEvidence,
} from '@zktx.io/ptb-model';

const filteredParameters = openSignatures.filter(
  (signature) => !isTxContextOpenSignature(signature),
);
const concreteTypeArgument = '0x2::sui::SUI';
const runtimeType = toPTBTypeFromConcreteTypeArgument(concreteTypeArgument);
const [firstParameter] = filteredParameters;
const parameterType =
  firstParameter === undefined
    ? { kind: 'unknown' }
    : toPTBTypeFromOpenSignature(firstParameter, [concreteTypeArgument]);

const moveSignatures: MovePackageSignatureEvidence = buildHostEvidence();
if (!isMovePackageSignatureEvidence(moveSignatures)) {
  throw new Error('Host evidence must match the model evidence shape.');
}
const irDiagnostics = validateTransactionIR(ir, { moveSignatures });
const graphDiagnostics = analyzePTBGraph(graph, { moveSignatures }).diagnostics;
const executableGraph = parseExecutableGraph(graph, { moveSignatures });
const graphIR = graphToTransactionIR(executableGraph);
```

`isTxContextOpenSignature()` is a top-level parameter filter. The evidence
guards still reject any remaining `TxContext` type nested anywhere in parameter
or return signature trees. The signature-to-`PTBType` helpers normalize concrete
Move type argument strings with the installed SDK type-tag parser and map
OpenSignature generic structs to generic object types. Concrete type argument
strings preserve their full object `typeTag`; open generic signatures remain
generic object types even when concrete type arguments are supplied. These
helpers define the model evidence shape only. Evidence-aware `MoveCall` result
arity and limited `MakeMoveVec` element type validation are available only when
the host explicitly passes `moveSignatures` to `validateTransactionIR()`,
`analyzePTBGraph()`, `parseExecutableGraph()`, or `graphToTransactionIR()`.
Graph-to-IR conversion may
materialize an evidence-derived MoveCall `resultCount` into the returned IR, and
IR-to-graph conversion then preserves that count in `params.runtime.resultCount`.
The model does not fetch package metadata, persist evidence in PTB documents, or
infer result arity from metadata fields that happen to be present on raw PTB
data. Malformed `moveSignatures` options are rejected; validate host evidence
with `isMovePackageSignatureEvidence()` before passing it. Mermaid rendering can
surface evidence diagnostics already stored on the IR. Raw
conversion and TS SDK renderability validators do not accept Move signature
evidence and recompute their own evidence-free checks.

Do not store transaction semantics in `params.ui`. MoveCall targets and
`resultCount`, MakeMoveVec explicit type, Publish modules and dependencies, and
Upgrade package/modules/dependencies belong in `params.runtime`. Concrete
MoveCall type arguments are graph entities: store them as `TypeArgument` nodes
and connect each `out_type` port to the MoveCall command's `in_type_N` port with
a `type` edge. `TransactionIR`, raw PTB conversion, and TS SDK code rendering
still use `IRCommand.MoveCall.typeArguments` arrays after graph-to-IR lowering.

When updating a downstream builder, CLI, example, fixture, or template, first
convert its data to the canonical model contract. Remove local duplicates of
model helpers, remove builder-style handle aliases such as `out_coin_0` and
`out_ret_0`, and remove stale UI fields such as `modulesCount`, `depsCount`,
`policyWidth`, and `params.ui.readOnly`. If compatibility with older stored data
is required, perform that translation in an explicitly named compatibility
utility before calling canonical model parsers or converters.

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
deep-frozen by this package. Structural checks also require model-owned fields
such as PTB types, argument references, `canonicalRaw`, and SDK metadata to be
dense arrays, plain objects, or primitives; class instances are rejected instead
of being frozen by reference. It does not mean the IR can be rendered to every
projection. Unsupported inputs or commands may still be present for inspection
and graph round-trips. Use `validateTsSdkRenderableIR()` /
`assertTsSdkRenderableIR()` before TS SDK code string generation, and use
`validateRawConvertibleIR()` / `assertRawConvertibleIR()` before raw PTB
conversion. Runtime adapters must validate their own SDK construction boundary.
`parseStructuralTransactionIR()` clones host-provided
IR before freezing it; `createTransactionIR()` only creates a frame and freezes
diagnostics, so it does not produce a structural fast-path value.
Serialization or `structuredClone()` removes this package's structural brand.
Validate cloned or deserialized IR again before relying on projection fast paths.

Parsed documents are detached only after the whole document is validated as
JSON-like data. `parsePTBDocV4()` rejects exotic class instances, sparse arrays,
and cyclic references in `modules`, `objects`, graph values, and other document
fields. Direct graph validation rejects non-plain variable values and
unsupported-command runtime values before graph-to-IR conversion. Direct
in-memory conversion helpers detach arrays and plain objects for graph variable
values and `Unsupported.value`; payloads that contain functions, symbols, sparse
arrays, or non-plain class instances are not accepted as model-owned graph data.
Cyclic arrays and plain objects are allowed only for defensive in-memory
inspection payloads, not for parsed PTB documents; Mermaid renders those cycles
as `[Circular]` instead of treating them as serializable document data.

## Supported Raw PTB Surface

Canonical raw inputs:

- `Pure`
- `Object`
- `FundsWithdrawal`

Canonical object inputs:

- `ImmOrOwnedObject`
- `SharedObject`
- `Receiving`

`TransactionIR` represents object inputs with an explicit source:

- `source: { kind: 'Resolved', object }` for raw PTB object references that
  carry the required object reference fields.
- `source: { kind: 'Unresolved', objectId }` for SDK-authorable object ids that
  must be resolved by the SDK/runtime client through helpers such as
  `tx.object(id)`.

Raw PTB conversion accepts only resolved object references. Mermaid and TypeScript
SDK code rendering preserve the source distinction instead of synthesizing
resolved object reference fields from object metadata.

Canonical commands:

- `MoveCall`
- `TransferObjects`
- `SplitCoins`
- `MergeCoins`
- `Publish`
- `MakeMoveVec`
- `Upgrade`

SDK builder convenience shapes such as `$Intent`, `UnresolvedPure`, and `UnresolvedObject` are not canonical raw PTB. They produce diagnostics instead of being silently accepted. `Transaction.serialize()` can preserve unresolved builder objects; use resolved transaction-kind data when the host needs canonical raw PTB.

## Current Partial PTB Coverage

The supported surface above means the package can represent the listed PTB
inputs and commands as model data. It does not mean every projection can author,
decode, render, or execute every Sui behavior around those PTB structures.
Current partial or unsupported areas are:

- raw Pure bytes are validated as base64. When a concrete pure type hint is
  present, the bytes must round-trip through the installed SDK BCS schema for
  that type. The consuming Move type is not inferred;
- `MoveCall` result value types and `MakeMoveVec` element result types are not
  inferred from package metadata by default. When a host passes verified
  `moveSignatures` to `validateTransactionIR()`, `analyzePTBGraph()`,
  `parseExecutableGraph()`, or `graphToTransactionIR()`, the model can use the
  matching function signature to
  check `MoveCall` result arity, Result/NestedResult bounds, graph output ports,
  and comparable `MakeMoveVec` element types. Graph-to-IR conversion can fill a
  missing MoveCall `IRCommand.resultCount` from matching evidence; IR-to-graph
  conversion preserves that materialized count as `params.runtime.resultCount`.
  `MakeMoveVec` type checking only runs when the target MoveCall evidence has
  matching type arguments and result count, or when an input already carries a
  concrete PTB type. Generic, unknown, and object types without concrete
  `typeTag` evidence are skipped. Primitive `MakeMoveVec` input checks stay on
  existing argument diagnostics: Pure type mismatches use `ir.arg.pureType`, and
  non-Pure inputs use `ir.arg.semanticType`. String, vector, option, object, and
  MoveCall-result mismatches use `ir.command.makeMoveVec.elementTypeMismatch`.
  The package exports host-provided Move signature evidence types, guards, and
  OpenSignature-to-`PTBType` helpers, but it does not fetch package metadata
  itself;
- raw PTB `MoveCall` data does not carry result-count metadata. Raw conversion
  does not infer that count from package metadata; graph or manual IR authors
  may provide `CommandNode.params.runtime.resultCount` / `IRCommand.resultCount`
  when they have verified arity evidence, and host validation may pass
  `moveSignatures` separately;
- Publish and Upgrade represent compiled module bytes, dependencies, package
  ids, and tickets as PTB data; this package does not compile Move source,
  resolve package dependencies, or provide a Move toolchain authoring workflow;
- graph round-trips preserve transaction semantics but intentionally do not
  preserve SDK metadata fields such as `_argumentTypes` and
  `Argument.Input.type`;
- protocol limits or checks that require live `ProtocolConfig`, object
  ownership reads, package metadata reads, simulation, or execution remain
  outside this package.

## Unsupported Surface And Boundary Limitations

- `parsePTBDocV4()` accepts only the `ptb_4` document version.
- Raw PTB, `TransactionIR`, `PTBGraph`, and `PTBDocV4` shapes are closed at
  their model boundary. Fields not defined by the exported model types or the
  verified SDK raw PTB schema produce diagnostics instead of being silently
  preserved or ignored.
- Legacy PTB flow and document compatibility is not part of the canonical model
  parser, validator, converter, graph, renderer, or SDK-code path. If a
  compatibility bridge exists, it must be an explicitly named utility that
  converts into the canonical model contract before these APIs are called.
- SDK builder convenience shapes such as `$Intent`, `UnresolvedPure`, and
  `UnresolvedObject` are not canonical raw PTB.
- `PTBGraph` does not preserve SDK metadata fields such as `_argumentTypes` and
  `Argument.Input.type` through graph round-trips. It also treats `unknown` Pure
  byte type hints as absent when returning from graph to IR; concrete Pure type
  hints and object `typeTag` hints are preserved. Use raw/IR/raw conversion when
  SDK metadata fidelity matters.
- Extra fields inside SDK `_argumentTypes` metadata are rejected. A signature
  with hidden fields turns the containing MoveCall into `Unsupported` and emits
  a `raw.command.moveCall.argumentTypes` diagnostic. The field must match the
  exported `RawOpenSignature` shape exactly.
- `CommandNode.params.runtime` is the only graph command parameter section that
  can provide transaction semantics. `params.ui` is display-only and
  closed-shape; both sections use exported closed TypeScript shapes and
  command-specific runtime key validation. Builder-shaped sections such as
  `params.moveCall` are rejected as unknown fields.
- Sponsor `FundsWithdrawal` is preserved in raw, IR, graph, and Mermaid
  inspection paths, but TS SDK code string rendering rejects it because the
  public `@mysten/sui` transaction helper surface cannot represent it honestly.
- Empty raw Pure byte strings without a type hint are accepted at the raw byte
  layer because the installed SDK byte schema and decoder accept them. Empty
  bytes are not canonical BCS for any concrete pure type hint, so typed empty raw
  Pure bytes are rejected. This package does not infer the consuming Move type
  for raw Pure bytes.
- `IRPureValue` may contain `bigint` for typed pure code generation; use `jsonStringifyWithBigInt()` when serializing such IR values to JSON text.
- New support should be added only when it improves faithful Sui PTB
  representation, validation, conversion, graph editing, inspection rendering,
  or TypeScript SDK code-string rendering against the pinned SDK or verified Sui
  source. Sui PTB commands, inputs, metadata, or execution semantics that cannot
  yet be represented honestly across the affected model directions must remain
  documented as unsupported until that representation is implemented.
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
type-tag fields. `parseMoveTypeTag()` accepts canonical PTB Move type tags,
including primitives, vectors, and structs. `parseMoveStructTypeTag()` first
applies the same canonical parser and then accepts only top-level struct tags.
`parsePTBObjectTypeTagCandidate()` is narrower: use it for
`PTBType.object.typeTag` and graph object type hints, where primitives, vectors,
and model-known non-object structs (`0x1::string::String`,
`0x2::object::ID`, `0x2::object::UID`, `0x1::option::Option`,
`0x1::option::Option<T>`, and `0x2::tx_context::TxContext`) are not object
candidates.
This candidate check is shape-only; without package evidence it does not prove
that an arbitrary struct has the Sui `key` ability or represents a live object
type. Validators reject non-object candidates supplied as `PTBType.object`
`typeTag` values; signature helpers return `unknown` PTB types for unsupported
known non-object signature datatypes.
Struct module and type identifiers follow the model's Sui Move identifier rule,
including multi-character leading-underscore identifiers such as `_module`; do
not substitute SDK `isValidStructTag()` for these model helpers.

Address, object digest, and Move type-tag checks call the installed
`@mysten/sui@2.16.2` public utility and BCS helpers directly. The helper-backed
normalizers are `parseObjectId()`, `parseObjectDigest()`, `parseMoveTypeTag()`,
`parseMoveStructTypeTag()`, and `parsePTBObjectTypeTagCandidate()`.

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
SDK `OpenSignature` payload shape and adds model constraints such as
non-negative type parameter indexes and no unsupported fields. These fields are
SDK metadata, not transaction semantics, and renderers do not infer protocol
meaning from them.
`PTBGraph` is the visual editing model and does not preserve those metadata
fields through graph round-trips; use the raw/IR boundary when SDK metadata
fidelity matters.

Move signature evidence uses the same `RawOpenSignature` body shape, but it is a
model evidence channel rather than SDK raw metadata. Function evidence requires
plain dense `parameters` and `returns` arrays, a non-negative
`typeParameterCount`, in-bounds `typeParameter` indexes, and no remaining
`TxContext` types anywhere in parameter or return signature trees. Package
evidence keys must be canonical object ids.

When a `PTBGraph` declares flow nodes or flow edges, validation requires a
single Start-to-End flow path containing every command node. Graph fragments
without flow are accepted for programmatic construction. Flow edges are
transaction-order graph semantics; positions and viewport data are layout only.
Variable `rawInput` values must already be canonical raw inputs. "Canonical"
means the value already equals the corresponding parser result: object and
package IDs are normalized 32-byte `0x`-prefixed lowercase hex, `JsonU64` values
are decimal strings, object digests are SDK-valid base58 32-byte digests, and
base64 bytes contain no ASCII whitespace. Graph command runtime params for
MoveCall targets, package IDs, dependencies, module bytes, and MakeMoveVec
explicit types are transaction inputs; UI params are never read as transaction
semantics. MoveCall type arguments are `TypeArgument` nodes connected through
`type` edges, not fields under `params.runtime`. Value-only object variables are
a graph convenience for unresolved SDK object ids. They lower to
`IRInput.Object` with `source.kind === 'Unresolved'` only when the value is a
canonical object id string or an object carrying a canonical `objectId`.
Non-canonical ids emit `graph.input.object.unresolved`; `Receiving`,
`SharedObject`, and unrecognized `value.kind` values emit
`graph.input.object.invalidKind` because those raw PTB object inputs must use
`rawInput`. Mermaid rendering shows
diagnostics for invalid references and omits edges whose source node does not
exist.

Graph `rawInput` values are closed-shape canonical raw inputs. Pure `rawInput`
cannot also carry a typed graph `value`. Object and `FundsWithdrawal` rawInput
may carry a graph `value` only when that value structurally equals the canonical
raw payload.

The scalar normalizers, SDK metadata guard, and diagnostic helpers are exported
for host-side validation before creating raw or graph values:
`parseJsonU64()`, `parseBase64Bytes()`, `parseObjectId()`,
`parseObjectDigest()`, `parseMoveIdentifier()`, `parseMoveTypeTag()`,
`parseMoveStructTypeTag()`, `parsePTBObjectTypeTagCandidate()`,
`isRawInputArgumentType()`, `isRawMoveCallArgumentTypes()`, and
`errorDiagnostic()` / `freezeDiagnostics()`.

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
- `tx.object(...)`
- `tx.objectRef(...)`
- `tx.sharedObjectRef(...)`
- `tx.receivingRef(...)`
- `tx.withdrawal(...)`

Code string rendering validates the `TransactionIR` shape and conversion
requirements before rendering. Unresolved object ids render through
`tx.object(id)`; resolved object references render through the resolved SDK
helpers. Unsupported inputs and shapes that cannot be represented honestly with
the public SDK helper surface throw instead of emitting incomplete or misleading
code.

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
must not carry a typed `value`. When raw `bytes` carry a concrete pure type hint,
validation checks that the payload round-trips through the installed SDK BCS
schema for that type. For example, `vector<u8>` bytes must include BCS vector
framing; a raw byte blob is not a canonical `vector<u8>` payload.
`validateTransactionIR()` rejects ambiguous Pure inputs instead of letting raw,
graph, or code rendering paths silently choose one representation.

Empty base64 strings are accepted at the raw byte layer because the SDK
`BCSBytes` schema is a string and the SDK base64 decoder accepts empty strings.
`ptb-model` does not infer the expected Move type for raw Pure bytes. If a
concrete type hint is present, empty bytes must pass that type's BCS round-trip
check; otherwise Move argument decoding may still reject untyped bytes when a
command consumes them.

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

This package treats graph support as Sui PTB graph support, not as a general UI
workflow surface. Updates to raw, IR, graph, Mermaid, or TypeScript SDK code
paths should be judged by whether they improve the canonical representation of
Sui PTB data and whether unsupported PTB surface is named clearly. Compatibility
with older flow or document shapes must be handled before this boundary by an
explicit compatibility utility, not by fallback logic inside these conversion
rules.

All model array fields must be dense JavaScript arrays. Sparse arrays are
rejected at public validation and conversion boundaries instead of being treated
as omitted elements.

`transactionIRToRaw()` emits canonical raw PTB data only. A `Pure` input must already have raw `bytes`, and an `Object` input must already have a resolved object argument. Typed pure display values can be rendered to TS SDK code when the SDK pure helper supports the type, but they are not silently BCS-encoded by this package.

`transactionIRToRaw()`, `transactionIRToGraph()`, and `transactionIRToTsSdkCode()` validate the IR shape instead of treating stored `diagnostics` as authoritative state. IR values that were structurally checked by this package can skip the repeated structural validation step, but projection-specific checks still run. `transactionIRToMermaid()` preserves diagnostics in the diagram because it is an inspection renderer and does not treat structural branding as a rendering precondition.

When a graph is authored manually, `rawInput` is the canonical way to represent resolved raw `Object` inputs (`ImmOrOwnedObject`, `SharedObject`, and `Receiving`) and `FundsWithdrawal` inputs. A value-only object variable represents only an unresolved SDK object id when it is a canonical object id string or an object containing only `objectId`; it is not raw-exportable until a resolved raw object reference is supplied through `rawInput`.

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

`analyzePTBGraph()` reports graph diagnostics with explicit blocking surfaces.
Diagnostics whose graph `blocks.document` flag is true make the graph invalid as
canonical document data. Diagnostics whose graph `blocks.execution` flag is true
make the graph invalid for execution-oriented conversion.

Document validation is intentionally not the same as execution validation. A
graph may be persistable while it is still missing command input edges, missing a
complete Start-to-End flow path, missing a MoveCall target, or carrying a blank
`TypeArgument` node; those are normal intermediate editor states.
`parsePTBDocV4()` and `validatePTBDocV4()` reject malformed document data and
graph diagnostics that block documents, but they do not require the graph to be
executable.

`parseExecutableGraph()` is the executable graph boundary. It rejects any graph
diagnostic whose `blocks.execution` flag is true and returns a branded
`ExecutablePTBGraph` for callers that want a checked fast path. `graphToTransactionIR()`
accepts either an unchecked `PTBGraph` for inspection conversion or an
`ExecutablePTBGraph` returned by `parseExecutableGraph()`. Document-blocking
graphs return an empty IR with diagnostics; document-valid but execution-invalid
graphs still produce inspection IR with diagnostics so renderers and editors can
show the current graph state.

The executable graph brand is tied to the object returned by
`parseExecutableGraph()`. JSON serialization, `structuredClone()`, object spread,
or rebuilding the graph produces an unchecked `PTBGraph`; validate that new graph
again before using the executable fast path. Callers should pass the returned
`ExecutablePTBGraph` directly to `graphToTransactionIR()` and should not reuse
analysis facts after editing, cloning, or reloading graph data.

`analyzePTBGraph()` still reports diagnostics for top-level graph fields, node
ids, port ids, edge ids, handle existence, edge direction, edge role, duplicate
incoming command input edges, command input completeness, and command output
arity. Port ids must start with an ASCII letter and contain only ASCII letters,
digits, and underscores. This keeps typed handle suffixes and UI aliases out of
canonical `PTBGraph` data.
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

Command input ports use canonical ids such as `in_arg_0`, `in_elem_0`,
`in_amount_0`, `in_object_0`, `in_source_0`, `in_coin`, `in_destination`,
`in_recipient`, and `in_upgradeCap`. Indexed input ports must be dense from zero
within each command-specific group. Required command input ports must have
incoming IO edges for the graph to be executable, but inspection conversion can
still preserve the current graph state with diagnostics. For executable graphs,
commands with no results, such as `TransferObjects`, `MergeCoins`, and
`Unsupported`, must not declare IO output ports. Commands with exactly one known
result use `out_result`; the nested `out_0` form is accepted only when an actual
outgoing edge preserves an existing `NestedResult(i, 0)` reference. Commands
with multiple known results use dense nested result handles such as `out_0` and
`out_1`; `out_result` is not valid for multi-result command execution, and
`Result(i)` is valid only for a command with exactly one result, matching Sui
execution arity checks. A `MoveCall` with no explicit `resultCount` has unknown
arity, so the graph may declare `out_result` or u16-addressable nested `out_N`
handles without the model guessing the real count. Separate `outputs` arrays
are not transaction semantics.
Builder-style aliases such as bare `amount_0`, `MakeMoveVec` `in_arg_0`,
`out_coin_0`, and `out_ret_0` are not canonical model graph handles.

Graph edge casts bind the abstract graph scalar type `number` to a concrete Move
integer width such as `u64`. They are not general numeric conversions: concrete
`move_numeric` values are not widened or narrowed by an edge cast. Known command
arguments also enforce the SDK/Sui input class or pure type when the model can
verify it from typed inputs. For example, `SplitCoins.amounts` must be typed Pure
`u64`, `TransferObjects.address` must be typed Pure `address`, and
`MakeMoveVec` without an explicit type requires object inputs. Raw Pure byte
inputs can omit a type hint because this package does not infer the consuming
Move type. A manual IR `Pure` input with raw bytes and
`type: { kind: 'unknown' }` is treated as an untyped raw byte input for command
pure-type checks.

## Mermaid Rendering

`transactionIRToMermaid()` emits a Mermaid `flowchart`, not sequence or state syntax. Supported directions are `TD` and `LR`; supported themes are `none` and `semantic`. Unsupported renderer options fall back to the default rendering options and appear as diagnostics in the diagram.

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
Move signature evidence is not persisted in `PTBDocV4`. `parsePTBDocV4()` and
`validatePTBDocV4()` validate the embedded graph without `moveSignatures`; hosts
that need evidence-aware graph checks should parse the document first, then call
`analyzePTBGraph(doc.graph, { moveSignatures })`,
`parseExecutableGraph(doc.graph, { moveSignatures })`, or
`graphToTransactionIR(doc.graph, { moveSignatures })` with separately validated
evidence.
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

Diagnostics have a closed runtime shape:
`{ code, category, message, path? }`. Graph diagnostics also carry
`blocks: { document, execution }`. `category` describes the diagnostic for
grouping and display; graph `blocks` decide which model boundary the diagnostic
blocks. Warning-level diagnostics are not part of the model.

Package-created diagnostics are frozen at runtime. `TransactionIR.diagnostics`
is runtime-frozen when the IR is returned by package conversion functions or
created with `createTransactionIR()`; host-built `TransactionIR` literals should
use `freezeDiagnostics()` when runtime immutability matters.
`freezeDiagnostics()` validates the canonical diagnostic shape before freezing.

Stored diagnostics are not authoritative state across package upgrades. Re-run
validation after loading stored IR instead of relying on serialized diagnostic
objects. `validateTransactionIR()` returns freshly computed diagnostics by
default. Inspection flows that intentionally surface source diagnostics
alongside fresh diagnostics, such as raw-to-IR conversion, graph-to-IR
conversion, and Mermaid rendering, pass `includeExistingDiagnostics: true`
internally. Use that option only when stored source diagnostics should be shown
as inspection context instead of treated as authoritative validation state.

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
