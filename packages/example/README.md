# PTB Builder Example

This package is a local Vite host app for trying `@zktx.io/ptb-builder` during
development.

The example demonstrates host integration. It is not part of the builder
package runtime and it does not make PTB Builder a wallet, signer, custody
layer, transaction safety guarantee, simulator, or executor.

## What The Example Owns

- Wallet connection through `@mysten/dapp-kit-react`.
- Current network selection.
- Host-provided simulation and execution callbacks.
- Local editor and viewer routes.

## What PTB Builder Owns

- Graph UI editing.
- Strict `ptb_4` document load/export.
- React Flow to model `PTBGraph` conversion.
- Editor undo/redo session state.
- TypeScript SDK code preview.
- SDK Core metadata and transaction inspection helpers supplied by the builder
  package.

## Commands

From the repository root:

```sh
npm run build
npm run dev
npm run test:builder-flow
```

From `packages/example/`:

```sh
npm run dev
npm run build
npm run test
npm run lint
```

The root `npm run test:builder-flow` command runs builder tests and example
tests sequentially. Do not parallelize those two flows; both can consume
workspace package build artifacts.

## Routes

- `/`: route selection.
- `/editor`: editable PTB document workflow with file drop and undo/redo.
- `/viewer`: on-chain transaction viewer. Query format:
  `?tx=sui:<network>:<digest>` or `?tx=<digest>`.

Supported networks are derived from
`supportedNetworksForTransport()` in `@zktx.io/ptb-builder`; the example should
not maintain a separate transport capability table.

## Host Boundary

The example builds a runtime `Transaction` only through host callbacks and the
builder runtime adapter. Wallet signing and execution are performed by the host
app through dapp-kit.

Do not treat generated code preview, decoded transaction data, or exported PTB
documents as trusted signing material.
