# Programmable Transaction Blocks Builder (PTB Builder)

**PTB Builder** is a graphical toolkit for building, simulating, and executing **Programmable Transaction Blocks (PTBs)** on the Sui blockchain. It provides an intuitive drag‑and‑drop interface, automatic code generation, and on‑chain execution support — bridging the gap between developers and non‑developers.

![ptb-builder-editor.png](https://docs.zktx.io/images/ptb-builder-editor.png)

## Demo

- [https://ptb.wal.app/](https://ptb.wal.app/)

## Features

### 1. Transaction Construction and Pre‑Testing

* **Visual Editor**: Construct PTBs through a drag‑and‑drop graphical interface (React Flow–based).
* **Code Generation**: Automatically generate clean TypeScript code for the Sui TS SDK.
* **Simulation**: Pre‑simulate PTBs before execution to validate expected results.

### 2. Execute Transactions Without Coding

* **Accessible**: Non‑developers can create and run PTBs without writing code.
* **Real‑Time Feedback**: Errors and warnings are shown instantly during graph construction.

### 3. Save and Share

* **Graph Persistence**: Save PTB graphs locally and reload them later.
* **Collaboration**: Share saved graphs with team members or the community.

### 4. Visualization and Debugging

* **Execution Visualization**: View executed PTBs in a clear, visual format.
* **Debugging Tools**: Trace execution, inspect inputs/outputs, and fix issues.

### 5. On‑Chain Transaction Loading

* **Load from Digest**: Import an existing on‑chain transaction by digest and visualize its structure.

### 6. Themes

* **Initial Theme Selection**: Choose your preferred theme (`dark`, `light`, `cobalt2`, `tokyo.night`, `cream`).
* **Switch Anytime**: Change themes dynamically from the workspace.

## Supported Commands

The following PTB commands are currently supported:

* **SplitCoins** — split a coin object into multiple parts.
* **MergeCoins** — merge multiple coins into one.
* **TransferObjects** — transfer owned objects to a recipient.
* **MoveCall** — call any Move function from an on‑chain package.
* **MakeMoveVec** — create vectors from scalar values.

(Additional commands can be added via registry extensions.)

## Supported Inputs

Inputs follow `tx.option` conventions from the Sui TS SDK:

* **Scalars**: numbers, booleans, addresses, strings ✅
* **Objects**: supported for direct ownership/transfer ✅
  (includes `Coin<T>` objects)
* **Vectors**: scalars only ✅
  (❌ objects, including coins, are not supported in vectors)
* **Options**: available for scalars ✅
  (❌ not supported for objects)

## Provider Public API

When embedding PTB Builder into a dApp, only a minimal, stable API is exposed.

```ts
import { PTBBuilder, usePTB } from '@zktx.io/ptb-builder';

// Inside your React app:
<PTBBuilder
  theme="dark"            // initial theme (dark | light | cobalt2 | tokyo.night | cream)
  address={myAddress}      // sender address
  gasBudget={500_000_000}  // optional gas budget
  executeTx={execAdapter}  // adapter to execute transactions
  onDocChange={saveDoc}    // callback to persist PTBDoc
>
  <YourAppComponents />
</PTBBuilder>
```

### Public Hook

```ts
const { exportDoc, loadFromDoc, loadFromOnChainTx, setTheme } = usePTB();

// Export current PTB as a document
const doc = exportDoc({ sender: myAddress });

// Load a saved PTB document
loadFromDoc(doc);

// Load a PTB from an on‑chain transaction digest
await loadFromOnChainTx('sui:testnet', '0x1234…');

// Switch theme
setTheme('tokyo.night');
```

## Document Format

Internally, PTB Builder persists graphs as `PTBDoc` objects, which include:

* **graph**: nodes and edges of the PTB
* **modules**: embedded Move module metadata (for function signatures)
* **objects**: embedded object metadata (for owned assets)
* **chain**: target Sui network

This allows saving, sharing, and reloading graphs consistently across environments.

## Roadmap

* Expanded sharing and collaboration features
