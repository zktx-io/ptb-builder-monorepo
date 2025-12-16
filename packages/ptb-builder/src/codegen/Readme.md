# PTB Builder Argument & Return Value Policy

This document defines the **single source of truth** for how arguments are serialized and how return values are handled when building transactions (`buildTransaction`) and generating TypeScript SDK code (`buildTsSdkCode`).  
The goal: **runtime and codegen must behave identically.**

This is **not** the Move language spec. It describes the effective behavior of **Sui PTBs as built via `@mysten/sui` TypeScript SDK** (`Transaction`).

---

## Principles

- **Explicit `tx.pure.*` calls are emitted _only_ for `moveCall.arguments`.**  
  Notes: other Transaction helpers (e.g. `splitCoins`, `transferObjects`) may internally wrap raw JS values into `pure` inputs.
- **`splitCoins.amounts` are passed as raw numbers/strings** (the Sui `Transaction` helper normalizes them to `pure.u64` internally).
- **`splitCoins` outputs are destructured into N scalars** (never a single array).
- **`mergeCoins` uses only object handles.**
- **`transferObjects.recipient` is passed as a raw address string (or a pre-built tx argument).**
- **`makeMoveVec.elements` are object handles only** (as per Sui `Transaction.makeMoveVec` API).
- **Refs from prior commands are treated as transaction handles (pass-through).**
- **Repeated `pure(...)` calls must be hoisted into a single `const` and reused.**

---

## SDK Normalization (Important)

Even if PTB Builder does not emit explicit `tx.pure.*` for a given field, the Sui SDK may normalize raw values internally:

- `tx.transferObjects(objects, addressString)` normalizes string addresses via `tx.pure.address(addressString)` internally.
- `tx.splitCoins(coin, amounts)` normalizes `amounts` (`number | bigint | string`) via `tx.pure.u64(amount)` internally.

This doc uses:

- “Serialize? = Yes” → PTB Builder explicitly emits `tx.pure.*`.
- Some helpers may still end up as pure inputs due to SDK internal normalization.

---

## Runtime Failure Modes (Important)

PTB Builder can type-check connections, but it cannot guarantee that a user-provided object id is valid or that it matches the on-chain type expected by a Move function.

Common failures:

- Invalid/missing object id → `notExists` (often seen as `0x000...000` after normalization)
- Type mismatch (wrong coin type, wrong object type tag) → `CommandArgumentError { kind: TypeMismatch }` in the failing command index

Guidance:

- Do not leave `object` variables empty when they are used as inputs to commands.
- Prefer picking objects via the Assets picker so the `typeTag` matches (e.g. `Coin<...WAL>` vs `Coin<...SUI>`).
- If a port expects a specific `object<...>` type tag, wiring a plain `object` can still fail at runtime.

---

## Type Glossary

- **Object handle**: `tx.object('0x...')`, `tx.gas`, `tx.object.system`, `tx.object.clock`, `tx.object.random`, or outputs from prior commands.
- **Address literal**: `"0x..."`, or sentinel `myAddress` / `sender`.
- **Numeric literal**: `number`, `bigint`, `"123"` (decimal string), or `move_numeric` (width-aware where specified).
- **ID literal**: `"0x..."` (object id), serialized with `tx.pure.id` for moveCall args.
- **Bool**: `true` / `false`.
- **String literal**: supported only when the port type is `string` (serialized via `tx.pure.string` for moveCall args).

---

## A. Inputs From Variable Nodes

### splitCoins

| Field     | Type                             | Allowed? | Serialize?                | Notes                           |
| --------- | -------------------------------- | -------- | ------------------------- | ------------------------------- |
| `coin`    | Object handle                    | ✅       | No                        | Must be a handle.               |
| `amounts` | Numeric literal / `move_numeric` | ✅       | **No (`pure` forbidden)** | Multiple scalars, not a vector. |

**Output:** destructure into **N scalars** (one per amount).

---

### mergeCoins

| Field         | Type          | Allowed? | Serialize? | Notes             |
| ------------- | ------------- | -------- | ---------- | ----------------- |
| `destination` | Object handle | ✅       | No         | Must be a handle. |
| `sources`     | Object handle | ✅       | No         | Handles only.     |

---

### transferObjects

| Field       | Type            | Allowed? | Serialize?        | Notes                                                                                                                                            |
| ----------- | --------------- | -------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `objects`   | Object handle   | ✅       | No                | Handles only.                                                                                                                                    |
| `recipient` | Address literal | ✅       | **No (explicit)** | Pass raw string or sentinel; the Sui `Transaction.transferObjects` helper will normalize string addresses via `tx.pure.address(...)` internally. |

---

### makeMoveVec

| Field      | Type          | Allowed? | Serialize? | Notes                 |
| ---------- | ------------- | -------- | ---------- | --------------------- |
| `elements` | Object handle | ✅       | No         | Handles pass-through. |

Note: the Sui `Transaction.makeMoveVec` helper only accepts object arguments; for pure vectors use `tx.pure.vector(...)` (this project represents those via vector-typed variable nodes and `moveCall.arguments` serialization).

---

### moveCall

| Field           | Type             | Allowed? | Serialize?                                                                                         | Notes                                                                                                                       |
| --------------- | ---------------- | -------- | -------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `arguments`     | Object handle    | ✅       | No                                                                                                 | Handles pass-through.                                                                                                       |
|                 | Address literal  | ✅       | **Yes → `tx.pure.address`**                                                                        | Inject `myAddress/sender` if needed.                                                                                        |
|                 | ID literal       | ✅       | **Yes → `tx.pure.id`**                                                                             |                                                                                                                             |
|                 | Numeric literal  | ✅       | **Yes → width-specific `tx.pure.u8/u16/u32/u64/u128/u256`** (defaults to `u64` when width unknown) |                                                                                                                             |
|                 | Bool             | ✅       | **Yes → `tx.pure.bool`**                                                                           |                                                                                                                             |
|                 | String           | ✅       | **Yes → `tx.pure.string`**                                                                         |                                                                                                                             |
|                 | `vector<T>`      | ✅\*     | **Yes → `tx.pure.vector('<T>', arr)`**                                                             | `T ∈ { address, bool, id, string, u8/u16/u32/u64/u128/u256 }` and must match the **port type** (ABI-derived).               |
|                 | `option<T>`      | ✅\*     | **Yes → `tx.pure.option('<T>', value)`**                                                           | `T ∈ { address, bool, id, string, u8/u16/u32/u64/u128/u256 }`. Unwired `option<T>` ports serialize as `None` (`undefined`). |
|                 | Other string     | ❌       | —                                                                                                  | Unsupported.                                                                                                                |
| `typeArguments` | string type tags | ✅       | No                                                                                                 | **Never `pure`**; pass through raw strings (e.g. `'0x2::coin::Coin<...>'`), typically sourced from `in_targ_*` ports.       |

---

## B. Inputs From Prior Command Outputs (Refs)

> Treat as **transaction handles** unless explicitly known to be primitive.

### splitCoins

| Field     | From prior cmd | Allowed? | Serialize?                | Notes             |
| --------- | -------------- | -------- | ------------------------- | ----------------- |
| `coin`    | Handle         | ✅       | No                        | Must be a handle. |
| `amounts` | `move_numeric` | ✅       | **No (`pure` forbidden)** |                   |

**Output:** destructure into N scalars.

---

### mergeCoins

| Field         | From prior cmd | Allowed? | Serialize? | Notes |
| ------------- | -------------- | -------- | ---------- | ----- |
| `destination` | Handle         | ✅       | No         |       |
| `sources`     | Handle         | ✅       | No         |       |

---

### transferObjects

| Field       | From prior cmd | Allowed? | Serialize? | Notes                  |
| ----------- | -------------- | -------- | ---------- | ---------------------- |
| `objects`   | Handle         | ✅       | No         |                        |
| `recipient` | —              | —        | —          | Same as variable case. |

---

### makeMoveVec

| Field      | From prior cmd | Allowed? | Serialize? | Notes |
| ---------- | -------------- | -------- | ---------- | ----- |
| `elements` | Handle(s)      | ✅       | No         |       |

---

### moveCall

| Field       | From prior cmd | Allowed? | Serialize? | Notes                                                                                          |
| ----------- | -------------- | -------- | ---------- | ---------------------------------------------------------------------------------------------- |
| `arguments` | Any result     | ✅       | No         | Prior command outputs are already `TransactionArgument`s (object or pure). Never re-serialize. |

---

## Mandatory Output & Wiring Rules

- **splitCoins**
  - Call with `[a, b, c]` literal.
  - **Always destructure** results into separate vars.

- **mergeCoins / transferObjects / makeMoveVec / moveCall**
  - Every OUT port must bind to a new symbol in codegen/runtime.
  - No dangling outputs are allowed.

- **transferObjects**
  - `recipient` is passed as raw address string; the Transaction helper normalizes it.

- **makeMoveVec**
  - Elements are object handles only (no primitives).

- **moveCall**
  - Strict `pure` for **literal** args only; refs/outputs are pass-through.
  - Unwired `option<T>` inputs serialize as `None` (`undefined`) when `T` is pure-capable.

---

## MoveCall Return Value Policy

- **0 return values**
  - No variables created.
  - Do not assign or generate placeholders.

- **1 return value**
  - Assign to a single variable.
  - Example:
    ```ts
    const result_0 = tx.moveCall({ ... });
    ```

- **>1 return values**
  - Always destructure into multiple variables.
  - Example:
    ```ts
    const [result_0, result_1] = tx.moveCall({ ... });
    ```

---

## Important: MoveCall Port Mapping

- `in_targ_*` ports map to `moveCall.typeArguments` (generic type tags).
- `in_arg_*` (and any other non-`in_targ_*` in-ports) map to `moveCall.arguments`.
- `in_targ_*` must **not** be treated as `arguments` (no `pure`, no runtime serialization).
- Backward compatibility: older `.ptb` files may store type args under `node.params.moveCall.typeArgs`; the loader/codegen falls back to those when `in_targ_*` ports are present but unwired (or when no `in_targ_*` ports exist).

---

## MoveCall Target Source of Truth

MoveCall target can be present in multiple places (especially in older documents):

- Preferred (viewer / decoded tx): `node.params.runtime.target`
- Preferred (editor / ABI loaded): `node.params.ui.pkgId/module/func`
- Legacy fallback: `node.params.moveCall.package/module/function` or `node.params.moveCall.target`

If these become inconsistent, generated/executed calls may not match what the UI dropdown currently shows. Keep them aligned when editing or regenerating nodes.

---

## Implementation Checklist

- [ ] `splitCoins` → destructure outputs into N scalars.
- [ ] `splitCoins.amounts` → multiple scalars, never a vector.
- [ ] `splitCoins.amounts` → `move_numeric` treated as raw, never `pure`.
- [ ] `makeMoveVec.elements` → object handles only (no primitives).
- [ ] `moveCall.arguments` → only place where explicit `tx.pure.*` is applied.
- [ ] `moveCall.arguments` → numeric widths honored (`u8|u16|u32|u64|u128|u256`), default to `u64` if unknown.
- [ ] `moveCall.arguments` → ID literals use `tx.pure.id`.
- [ ] `moveCall.typeArguments` → always raw string literal.
- [ ] `transferObjects.recipient` → pass raw string; Transaction helper normalizes.
- [ ] All Command OUT ports → must bind to a variable.
- [ ] `moveCall` return values follow policy (0, 1, N).
- [ ] Hoist repeated `pure(...)` calls into a single `const`.

---
