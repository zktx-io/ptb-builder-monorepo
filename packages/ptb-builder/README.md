# Programmable Transaction Blocks Builder (PTB Builder)

**PTB Builder** is a graphical toolkit for authoring, inspecting, and rendering **Programmable Transaction Blocks (PTBs)** on the Sui blockchain. It provides an intuitive drag-and-drop interface, code rendering, and host integration points. The host application remains responsible for wallet connection, signing, simulation, and execution.

![ptb-builder-editor.png](https://docs.zktx.io/images/ptb-builder-editor.png)

## Demo

- [https://ptb.wal.app/](https://ptb.wal.app/)

## Architecture Boundary

`@zktx.io/ptb-builder` depends on `@zktx.io/ptb-model` so the builder can adopt
the model package as its canonical PTB data boundary. Model package APIs are the
boundary for new or refactored PTB data validation, raw PTB conversion, Mermaid
rendering, and TypeScript SDK code string rendering. Existing builder internals
still include local graph and code-rendering code until the later adoption
phases replace those paths.

Import the model package through `@zktx.io/ptb-model` only. Package-internal
model imports, model `dist` imports, and relative imports across package
boundaries are intentionally blocked for builder source.

Legacy PTB documents are not model inputs. The model parser rejects legacy
shapes, and the normal builder runtime accepts only current `ptb_4` documents.
Run any legacy migration outside this package before calling builder/model APIs.

## Features

### 1. Transaction Construction and Review

- **Visual Editor**: Construct PTBs via a drag‑and‑drop UI (React Flow-based).
- **Code Rendering**: Render TypeScript for the Sui TS SDK.
- **Host Review Hooks**: Let the host application provide simulation or execution adapters when needed.

### 2. Host-Controlled Execution

- **Accessible**: Users can create PTB structures without writing code.
- **Authority Stays Outside**: Wallet connection, signing, simulation, and execution stay in the host app.
- **Real‑Time Feedback**: Errors/warnings surface instantly during graph construction.

### 3. Save and Share

- **Graph Persistence**: Save PTB graphs locally and reload them later.
- **Collaboration**: Share saved graphs with teammates or the community.
- **Optional Export**: Expose an **Export .ptb** button from the UI (hidden by default).

### 4. Structure Visualization and Debugging

- **Loaded Transaction Structure View**: Visualize supported loaded PTB command and input structure as readable graphs.
- **Debugging Tools**: Inspect graph wiring, inputs, outputs, and validation feedback while editing.

### 5. On‑Chain Transaction Loading

- **Load from Digest**: Import an on‑chain transaction by digest and visualize its structure.

### 6. Use On‑Chain Assets as Objects

- **Asset Browser**: Browse objects owned by your address (coins, Move objects, modules, etc.).
- **One‑Click Insert**: Insert an object as an **Object node** in one click.
- **Seamless Integration**: Use assets directly in commands like `TransferObjects`, `MergeCoins`, `MoveCall`.

### 7. Themes

- **Initial Theme Selection**: `dark`, `light`, `cobalt2`, `tokyo-night`, `cream`, `mint-breeze`.
- **Switch Anytime**: Change themes dynamically from the workspace.

## Supported Commands

The following PTB commands are currently supported:

- **SplitCoins** — split a coin object into multiple parts.
- **MergeCoins** — merge multiple coins into one.
- **TransferObjects** — transfer owned objects to a recipient.
- **MoveCall** — call a Move function by entering its package, module, and
  function names explicitly; the builder verifies the selected function
  signature through the SDK Core API.
- **MakeMoveVec** — create vectors from scalar values.

(Additional commands can be added via registry extensions.)

## Supported Inputs

Inputs follow `tx.option` conventions from the Sui TS SDK:

- **Scalars**: numbers, booleans, addresses, strings ✅
- **Objects**: direct ownership/transfer supported ✅ (includes `Coin<T>`)
  - _Objects can also be selected from your owned assets via the **Assets modal**._
- **Vectors**: scalars only ✅ (❌ objects, including coins, are not supported in vectors)
- **Options**: available for scalars ✅ (❌ not supported for objects)

## Quick Start (dApp Integration)

The example app uses `@mysten/dapp-kit-react@2.x` and
`@mysten/sui@2.16.2`. The host creates the wallet/client provider and passes an
execution adapter into PTB Builder.

```tsx
import { createDAppKit, DAppKitProvider } from '@mysten/dapp-kit-react';
import {
  useCurrentAccount,
  useCurrentNetwork,
  useDAppKit,
} from '@mysten/dapp-kit-react';
import { Transaction } from '@mysten/sui/transactions';
import {
  Chain,
  createPtbCoreClientForNetwork,
  PTBBuilder,
  ToastVariant,
  type PtbCoreClientTransport,
} from '@zktx.io/ptb-builder';

import '@zktx.io/ptb-builder/index.css';
import '@zktx.io/ptb-builder/styles/themes-all.css';

const suiTransport: PtbCoreClientTransport =
  import.meta.env.VITE_SUI_TRANSPORT === 'graphql' ? 'graphql' : 'grpc';

const dAppKit = createDAppKit({
  networks: ['mainnet', 'testnet', 'devnet'],
  defaultNetwork: 'testnet',
  createClient(network) {
    // Uses SDK Core transport only. gRPC is the default path; GraphQL is
    // available for networks with a verified endpoint.
    return createPtbCoreClientForNetwork(network, { transport: suiTransport });
  },
});

function BuilderApp() {
  const account = useCurrentAccount();
  const network = useCurrentNetwork();
  const dAppKit = useDAppKit();
  const createClient = (chain: Chain) =>
    dAppKit.getClient(chain.replace(/^sui:/, '') as 'mainnet' | 'testnet' | 'devnet');

  const executeTx = async (
    chain: Chain,
    transaction: Transaction | undefined,
  ): Promise<{ digest?: string; error?: string }> => {
    if (!account || !transaction) return { error: 'No account or transaction' };
    const targetNetwork = chain.replace(/^sui:/, '') as 'mainnet' | 'testnet' | 'devnet';
    if (network !== targetNetwork) {
      return { error: `Switch to ${targetNetwork} before executing this PTB` };
    }
    const result = await dAppKit.signAndExecuteTransaction({ transaction });
    const executed =
      result.$kind === 'Transaction'
        ? result.Transaction
        : result.FailedTransaction;
    return { digest: executed.digest };
  };

  const simulateTx = async (
    chain: Chain,
    transaction: Transaction | undefined,
  ): Promise<{ success?: boolean; error?: string }> => {
    if (!transaction) return { error: 'No transaction' };
    const client = createClient(chain);
    const bytes = await transaction.build({ client });
    const result = await client.core.simulateTransaction({
      transaction: bytes,
      include: { effects: true },
    });
    const simulated =
      result.$kind === 'Transaction'
        ? result.Transaction
        : result.FailedTransaction;
    const error =
      simulated.status.error?.message || simulated.status.error?.$kind;
    return { success: simulated.status.success, error };
  };

  const toast = ({ message, variant }: { message: string; variant?: ToastVariant }) => {
    console.log(variant ?? 'info', message);
  };

  return (
    <PTBBuilder
      toast={toast}
      executeTx={executeTx}
      simulateTx={simulateTx}
      createClient={createClient}
      address={account?.address}
      showExportButton
    />
  );
}

export function App() {
  return (
    <DAppKitProvider dAppKit={dAppKit}>
      <BuilderApp />
    </DAppKitProvider>
  );
}
```

Use `useDAppKit().switchNetwork(network)` to switch networks in the host app.
`createPtbCoreClientForNetwork(..., { transport: 'graphql' })` throws when the
requested network has no verified GraphQL endpoint in the package client table.
`loadFromDoc()` accepts current `ptb_4` documents only. Legacy document
migration is intentionally outside this package.

### SDK Core client boundary

`createPtbCoreClient()` and `createPtbCoreClientForNetwork()` return SDK Core
clients for read/load paths. The exported `PtbCoreClient` type is an alias of
the pinned `@mysten/sui@2.16.2` `ClientWithCoreApi` type, not a separate stable
client abstraction owned by PTB Builder. Host applications may provide their own
`ClientWithCoreApi`-compatible client through `createClient`, but SDK Core type
changes are part of the Sui SDK boundary and should be reviewed when upgrading
`@mysten/sui`.

## Public API (Provider + Hook)

### Provider (component)

```tsx
import '@zktx.io/ptb-builder/index.css';
import '@zktx.io/ptb-builder/styles/themes-all.css';
// Or import a specific theme only: import '@zktx.io/ptb-builder/styles/theme-light.css';

import { PTBBuilder } from '@zktx.io/ptb-builder';

<PTBBuilder
  theme="dark" // initial theme (dark | light | cobalt2 | tokyo-night | cream | mint-breeze); defaults to "dark"
  address={myAddress} // sender address
  gasBudget={500_000_000} // optional gas budget
  executeTx={execAdapter} // host-provided execution adapter
  createClient={clientFactory} // host-provided SDK Core client factory for reads/loads
  onDocChange={saveDoc} // PTBDoc autosave callback (debounced)
  showExportButton // optional: show Export .ptb button (default: hidden)
>
  {/* your app here */}
</PTBBuilder>;
```

### Hook (public)

```tsx
import { usePTB } from '@zktx.io/ptb-builder';

const { exportDoc, loadFromDoc, loadFromOnChainTx, setTheme } = usePTB();

// Export current PTB document
const doc = exportDoc({ sender: myAddress });

// Load document from memory or disk
loadFromDoc(doc);

// Load graph from on-chain transaction digest
await loadFromOnChainTx('sui:testnet', '0x1234…');

// Switch theme at runtime
setTheme('tokyo-night');
```

### Styling & Theme imports

- `@zktx.io/ptb-builder/index.css` contains the structural styles for nodes, edges, and the builder chrome. It should be imported exactly once in your host app (or exposed by your bundler) regardless of the theme you choose.
- `@zktx.io/ptb-builder/styles/themes-all.css` bundles every theme token file so you can switch themes at runtime with `setTheme`. Pulling in the whole pack adds roughly ~18 kB pre-gzip.
- To minimize CSS for static deployments, import only the theme(s) you actually ship, e.g. `import '@zktx.io/ptb-builder/styles/theme-dark.css';`. Each theme file is ~3 kB pre-gzip, so picking a single one keeps the bundle lean while still allowing dynamic switching between the themes you explicitly include.
- When you only ship a single theme file, pass the matching `theme` value (e.g., `theme="light"`) and set `showThemeSelector={false}` so the UI doesn’t expose choices that aren’t bundled.

### Autosave, undo/redo & `onDocChange`

- PTB Builder emits `onDocChange` immediately when the underlying PTB graph, modules, objects, or active chain changes. Viewport changes (pan/zoom) are debounced by 250 ms so autosave targets are not overwhelmed while the user drags the canvas.
- Loading a document via `loadFromDoc`/`loadFromOnChainTx` resets the internal history cache, replays the snapshot once, and suppresses duplicate events until the user edits again.
- The sample `usePtbUndo` hook keeps a stable signature per `PTBDoc`, so undo/redo operations call `loadFromDoc` without collapsing the redo stack. A single flag (`suppressNext`) prevents the ensuing `onDocChange` from being treated as a fresh edit.
- When integrating your own autosave pipeline, expect `onDocChange` to fire often during graph edits but only after the debounce window for viewport-only motions.

---

## Props Reference (`<PTBBuilder />`)

| Prop                | Type                                                                                  | Default  | Description                                                   |
| ------------------- | ------------------------------------------------------------------------------------- | -------- | ------------------------------------------------------------- |
| `theme`             | `Theme` (`dark` \| `light` \| `cobalt2` \| `tokyo-night` \| `cream` \| `mint-breeze`) | `"dark"` | Initial UI theme.                                             |
| `showThemeSelector` | `boolean`                                                                             | `true`   | Renders the theme dropdown in the CodePip panel.              |
| `address`           | `string`                                                                              | –        | Sender address for generated transactions.                    |
| `gasBudget`         | `number`                                                                              | –        | Optional gas budget used for tx build/exec.                   |
| `executeTx`         | `(chain: Chain, tx?: Transaction) => Promise<{ digest?: string; error?: string }>`    | –        | Host-provided execution adapter.                              |
| `simulateTx`        | `(chain: Chain, tx?: Transaction) => Promise<{ success?: boolean; error?: string }>`  | –        | Host-provided simulation adapter used by the Dry run action.  |
| `createClient`      | `(chain: Chain) => ClientWithCoreApi`                                                 | gRPC     | Optional host-provided SDK Core client factory for read/load paths. |
| `toast`             | `ToastAdapter`                                                                        | console  | Custom toast adapter used by the provider.                    |
| `onDocChange`       | `(doc: PTBDoc) => void`                                                               | –        | Autosave callback (debounced).                                |
| `showExportButton`  | `boolean`                                                                             | `false`  | If `true`, shows **Export .ptb** button in the CodePip panel. |
| `children`          | `React.ReactNode`                                                                     | –        | Children rendered inside the Provider.                        |

---

## Document Format

PTB Builder persists graphs as `PTBDoc` objects containing:

- **version** — current documents use `ptb_4`
- **graph** — nodes and edges of the PTB
- **modules** — embedded Move function signature metadata for already-resolved
  MoveCall targets
- **objects** — embedded object metadata (for owned assets)
- **chain** — target Sui network (e.g., `sui:testnet`)

This enables saving, sharing, and reloading graphs consistently across environments.

---

## Notes on Network Sync

- Use `useCurrentNetwork()` and `useDAppKit().switchNetwork()` from
  `@mysten/dapp-kit-react` to read/change the active Sui network.
- Keep PTB `doc.chain` in the form `sui:<network>`, e.g., `sui:testnet`.
- On file drop, prefer validating with `/^sui:(mainnet|testnet|devnet)$/` before switching the network.

---

## Roadmap

- Expanded sharing and collaboration features
