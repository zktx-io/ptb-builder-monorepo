# @zktx.io/ptb-cli

Render supported Sui Programmable Transaction Block data as Mermaid text through
`@zktx.io/ptb-model`.

This package is a thin CLI adapter. It reads one supported transaction input,
asks `@zktx.io/ptb-model` to normalize and render the PTB, and prints Mermaid
text. It does not sign, simulate, execute, connect wallets, use JSON-RPC, or
take custody of assets.

Agents and scripts can use this CLI to turn supported Sui PTB transaction data
into Mermaid text: run `ptb`, prefer `--json`, and parse stdout as one JSON
envelope.

## Install

`@zktx.io/ptb-cli` requires Node.js 22 or newer. This matches the pinned
`@mysten/sui` SDK runtime used for local byte decoding and read-only gRPC or
GraphQL transaction lookup.

```bash
npx @zktx.io/ptb-cli mermaid --help
```

## Usage

```text
ptb mermaid <transaction-data-hex>
ptb mermaid <mainnet|testnet|devnet> <transaction-digest>
```

The only local transaction input is hex-encoded Sui `TransactionData` BCS
bytes. This is the full transaction data produced by `Transaction.build()`,
then encoded as hex with or without a `0x` prefix.
Transaction-kind bytes, raw JSON, files, and stdin are rejected.

For SDK-built transactions, pass the hex form of the full transaction bytes:

```ts
import { toHex } from '@mysten/bcs';

const txDataHex = toHex(await tx.build());
```

```bash
npx @zktx.io/ptb-cli mermaid "$TX_DATA_HEX"
```

Fetch a transaction by digest with read-only Sui Core APIs. gRPC is the default
transport:

```bash
npx @zktx.io/ptb-cli mermaid mainnet 8KjkR3gyEZExZE11BHDFGNsZyNXYBrENhctxGfKs57Sg
```

Use GraphQL when the same digest lookup should go through the GraphQL transport:

```bash
npx @zktx.io/ptb-cli mermaid mainnet 8KjkR3gyEZExZE11BHDFGNsZyNXYBrENhctxGfKs57Sg --transport graphql
```

Use shortened labels when Mermaid output should be easier to scan:

```bash
npx @zktx.io/ptb-cli mermaid "$TX_DATA_HEX" --shorten-labels
```

Text mode prints Mermaid directly:

```text
flowchart LR
  input0["Input 0: ..."]
  command0["Command 0: ..."]
```

## Agent And Script Workflow

Use `--json` for non-interactive runs. The command writes one JSON document to
stdout, so the caller can branch on `ok` before reading `mermaid`,
`diagnostics`, or `error`.

Use one of these two input paths:

1. If you have a transaction digest, pass the network and digest:

   ```bash
   npx @zktx.io/ptb-cli mermaid mainnet "$DIGEST" --json
   ```

2. If you have an SDK-built `Transaction`, build full transaction data bytes and
   pass their hex form:

   ```ts
   import { toHex } from '@mysten/bcs';

   const txDataHex = toHex(await tx.build());
   ```

   ```bash
   npx @zktx.io/ptb-cli mermaid "$TX_DATA_HEX" --json
   ```

Do not pass transaction-kind bytes, base64 strings, raw JSON, file paths, stdin,
or a live SDK `Transaction` object. This CLI does not read files or stdin and it
does not deserialize base64 transaction data. Convert those inputs before calling
the CLI, or use the network/digest path.

Recommended parsing rules:

- Branch first on `ok`.
- When `ok` is `true`, read `mermaid` as visualization text and inspect
  `diagnostics`; a successful command can still include model diagnostics.
- When `ok` is `false`, branch on `error.code`. Treat `error.cause` as optional
  debugging detail, not a stable user-facing string.
- Use `--shorten-labels` for compact chat or issue output. Omit it when exact
  object ids, package ids, or type tags need to stay visible in the Mermaid text.
- Do not treat Mermaid output as signing material, simulation output, execution
  evidence, or a transaction safety decision.

## JSON Envelope

The package root exports only `runCli`; lower-level CLI internals are not a
supported API. The `--json` output uses these stable top-level fields.

```bash
npx @zktx.io/ptb-cli mermaid mainnet 8KjkR3gyEZExZE11BHDFGNsZyNXYBrENhctxGfKs57Sg --json
```

Stable success fields:

```json
{
  "ok": true,
  "command": "mermaid",
  "diagnostics": [],
  "mermaid": "flowchart LR\n...",
  "summary": {
    "inputs": 1,
    "commands": 1,
    "diagnosticCount": 0
  }
}
```

Stable failure fields:

```json
{
  "ok": false,
  "command": "mermaid",
  "error": {
    "code": "decode.transaction",
    "message": "Unable to deserialize Sui TransactionData hex."
  }
}
```

## Options

```text
--json                    Emit a machine-readable JSON envelope.
--transport <grpc|graphql> Read-only digest lookup transport. Default: grpc.
--grpc-url <url>          Override the network gRPC endpoint.
--graphql-url <url>       Override the network GraphQL endpoint.
--shorten-labels          Shorten long Mermaid node labels.
--timeout-ms <ms>         Network digest lookup timeout. Default: 30000.
--help                    Show help.
```

`--transport`, `--grpc-url`, and `--graphql-url` only apply to
`<network> <transaction-digest>` input. Supported network labels are `mainnet`,
`testnet`, and `devnet`.

Transport behavior follows the pinned `@mysten/sui@2.16.2` SDK source:

- gRPC uses `SuiGrpcClient` with `GrpcWebFetchTransport` and the SDK Core
  `getTransaction` method.
- GraphQL uses `SuiGraphQLClient` and the SDK Core `getTransaction` method over
  a GraphQL POST request.
- Both transports request parsed transaction data needed for PTB rendering and
  stay read-only. There is no JSON-RPC fallback.

## Exit Codes

| Code | Meaning                                                                                                   |
| ---- | --------------------------------------------------------------------------------------------------------- |
| `0`  | The command completed and emitted `ok: true`.                                                             |
| `1`  | The command emitted `ok: false` for a decode, model, network, transaction-support, or unexpected failure. |
| `2`  | The command emitted `ok: false` for usage or input setup errors.                                          |

## Error Codes

| Code                      | Meaning                                                                                                     |
| ------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `decode.transaction`      | TransactionData hex could not be decoded by the pinned Sui SDK.                                             |
| `input.missing`           | No input was provided.                                                                                      |
| `input.network`           | A network label was provided without a transaction digest.                                                  |
| `input.unsupported`       | Unsupported local input such as TransactionKind bytes, raw JSON, a file/path-like value, or stdin was used. |
| `model.failed`            | `@zktx.io/ptb-model` rejected the input with a model error.                                                 |
| `network.fetch`           | The network digest lookup failed before returning a transaction.                                            |
| `network.timeout`         | The network digest lookup exceeded `--timeout-ms`.                                                          |
| `output.serialize`        | The CLI could not serialize the intended JSON error envelope.                                               |
| `output.write`            | The CLI could not write the intended stdout or stderr output.                                               |
| `transaction.unsupported` | The fetched transaction did not contain supported PTB data.                                                 |
| `unexpected`              | An unexpected CLI failure occurred.                                                                         |
| `usage.command`           | The command was not recognized.                                                                             |
| `usage.graphqlUrl`        | `--graphql-url` was invalid or paired with `--transport grpc`.                                              |
| `usage.grpcUrl`           | `--grpc-url` was invalid or paired with `--transport graphql`.                                              |
| `usage.input`             | Positional input did not match a supported command shape.                                                   |
| `usage.network`           | The network label was not `mainnet`, `testnet`, or `devnet`.                                                |
| `usage.timeout`           | `--timeout-ms` was not a positive safe integer.                                                             |
| `usage.transport`         | Transport options were invalid or used without network digest input.                                        |
| `usage.unknown`           | An unknown option was provided.                                                                             |
| `usage.value`             | A flag that requires a value did not receive one.                                                           |
