# PTB Builder Monorepo

React and TypeScript packages for authoring, inspecting, converting, and
rendering Sui Programmable Transaction Block data.

This repository contains two package boundaries:

- `@zktx.io/ptb-model`: UI-independent PTB data model, validation, conversion,
  Mermaid rendering, and TypeScript SDK code string rendering.
- `@zktx.io/ptb-builder`: React UI package for graph-based PTB editing. It uses
  `@zktx.io/ptb-model` as its transaction data boundary.

The packages are intentionally not wallets, custody layers, transaction safety
guarantees, or autonomous executors. Host applications own wallet connection,
signing, simulation, execution, and user workflow decisions. The builder package
contains read-only chain loading and local metadata cache code; that does not
make it the owner of wallet authorization or transaction execution.

## Packages

| Package                | Path                    | Purpose                                                                                                                                                                                                                                                      |
| ---------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `@zktx.io/ptb-model`   | `packages/ptb-model/`   | Canonical PTB data boundary. Converts supported raw Sui PTB-shaped data into `TransactionIR`, converts between `TransactionIR` and `PTBGraph`, validates model shapes, renders Mermaid text, and renders TypeScript SDK transaction-building source strings. |
| `@zktx.io/ptb-builder` | `packages/ptb-builder/` | Published React package with the PTB editor UI, graph workspace, styling exports, and host integration points.                                                                                                                                               |
| Example app            | `packages/example/`     | Local Vite app for trying the builder package during development.                                                                                                                                                                                            |

For model-specific behavior and limitations, start with
[`packages/ptb-model/README.md`](packages/ptb-model/README.md). For React
builder integration details, use
[`packages/ptb-builder/README.md`](packages/ptb-builder/README.md).

## Data Boundary

`@zktx.io/ptb-model` keeps three structures separate:

- `RawProgrammableTransaction`: normalized Sui PTB-shaped input/output.
- `TransactionIR`: canonical transaction model used for validation, conversion,
  Mermaid rendering, and SDK-code string rendering.
- `PTBGraph`: graph document model used for visual editing and persistence.

```mermaid
flowchart TD
  raw["RawProgrammableTransaction"] --> ir["TransactionIR"]
  ir --> raw
  graph["PTBGraph"] --> ir
  ir --> graph
  ir --> mermaid["Mermaid text"]
  ir --> code["TS SDK code string"]
  builder["ptb-builder UI"] <--> graph
```

Mermaid output is generated from `TransactionIR`, not React Flow screen state.
Other applications can use `@zktx.io/ptb-model` as a PTB visualization adapter:
convert supported raw PTB or SDK transaction-kind data into
`TransactionIR`, then call `transactionIRToMermaid()`.

The model package does not accept serialized BCS bytes, base64 transaction
strings, or live SDK `Transaction` instances directly. Use the Sui SDK to turn
those into SDK transaction-kind data first, then pass that data to
`rawTransactionToIR()`.

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

If the host already has an SDK `Transaction` object, pass `tx.getData()` to
`rawTransactionToIR()`; do not pass the live `Transaction` instance itself.

## Builder Package

`@zktx.io/ptb-builder` owns the React editing experience. It provides the graph
workspace, theme CSS exports, and host-facing integration points such as the
execution adapter prop. The host app remains responsible for deciding whether
and how to sign, simulate, or execute a transaction.

Basic package imports:

```tsx
import { PTBBuilder } from '@zktx.io/ptb-builder';

import '@zktx.io/ptb-builder/index.css';
import '@zktx.io/ptb-builder/styles/themes-all.css';
```

Use a specific theme CSS file instead of `themes-all.css` when the host app does
not need runtime switching across every bundled theme.

## Development

Install dependencies from the repository root:

```sh
npm install
```

Useful root commands:

```sh
npm run test:model
npm run build
npm run lint
npm run dev
```

Package-specific commands:

```sh
npm run typecheck --workspace @zktx.io/ptb-model
npm run test --workspace @zktx.io/ptb-model
npm run build --workspace @zktx.io/ptb-model

cd packages/ptb-builder && npm run build
cd packages/example && npm run dev
```

## Boundaries And Non-Goals

- The model package has no React, React Flow, DOM, CSS, wallet, signer, network
  client, JSON-RPC, or runtime `Transaction` dependency.
- The builder package is UI and integration code. It should use the model
  package for canonical PTB validation and conversion.
- Document parsing accepts supported package document versions only. Convert
  unsupported document shapes before calling model package APIs.
- SDK builder convenience shapes such as `$Intent`, `UnresolvedPure`, and
  `UnresolvedObject` are not canonical raw PTB commands.
- Host applications own execution authority. This repository should not be
  described as a wallet, custody layer, autonomous executor, or transaction
  safety guarantee.
