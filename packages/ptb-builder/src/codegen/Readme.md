# PTB Builder Argument & Return Value Policy

This document defines the **single source of truth** for how arguments are serialized and how return values are handled when building transactions (`buildTransaction`) and generating TypeScript SDK code (`buildTsSdkCode`).  
The goal: **runtime and codegen must behave identically.**

---

## Principles

- **Pure serialization is applied *only* inside `moveCall.arguments`.**  
  (`tx.pure.address`, `tx.pure.u64`, `tx.pure.bool`, `tx.pure([...])` if needed)
- **`splitCoins.amounts` use raw numbers** (no `pure`).  
- **`splitCoins` outputs are destructured into N scalars** (never a single array).  
- **`mergeCoins` uses only object handles.**  
- **`transferObjects.recipient` never uses `pure`.**  
- **`makeMoveVec.elements` accept handles or primitive values, no `pure`.**  
- **Refs from prior commands are treated as transaction handles (pass-through).**  

---

## Type Glossary

- **Object handle**: `tx.object('0x...')`, `tx.gas`, `tx.object.system`, `tx.object.clock`, `tx.object.random`, or outputs from prior commands.  
- **Address literal**: `"0x..."`, or sentinel `myAddress` / `sender`.  
- **Numeric literal**: `number`, `bigint`, `"123"` (decimal string).  
- **Bool**: `true` / `false`.  
- **Other string**: not supported as Move values.  

---

## A. Inputs From Variable Nodes

### splitCoins
| Field       | Type            | Allowed? | Serialize?             | Notes |
|-------------|-----------------|----------|------------------------|-------|
| `coin`      | Object handle   | ✅        | No                     | Must be a handle. |
| `amounts`   | Numeric literal | ✅        | **No (`pure` forbidden)** | Multiple scalars, not a vector. |

**Output:** destructure into **N scalars** (one per amount).

---

### mergeCoins
| Field        | Type          | Allowed? | Serialize? | Notes |
|--------------|---------------|----------|------------|-------|
| `destination`| Object handle | ✅        | No         | Must be a handle. |
| `sources`    | Object handle | ✅        | No         | Handles only. |

---

### transferObjects
| Field       | Type            | Allowed? | Serialize? | Notes |
|-------------|-----------------|----------|------------|-------|
| `objects`   | Object handle   | ✅        | No         | Handles only. |
| `recipient` | Address literal | ✅        | **No `pure`** | Pass raw string or sentinel. |

---

### makeMoveVec
| Field       | Type                  | Allowed? | Serialize? | Notes |
|-------------|-----------------------|----------|------------|-------|
| `elements`  | Object handle         | ✅        | No         | Handles pass-through. |
|             | Address / Number / Bool | ✅      | No         | Use raw literals. |
|             | Other string          | ❌        | —          | Not supported. |

---

### moveCall
| Field       | Type            | Allowed? | Serialize?                | Notes |
|-------------|-----------------|----------|---------------------------|-------|
| `arguments` | Object handle   | ✅        | No                        | Handles pass-through. |
|             | Address literal | ✅        | **Yes → `tx.pure.address`** | Inject `myAddress/sender` if needed. |
|             | Numeric literal | ✅        | **Yes → `tx.pure.u64`**   | |
|             | Bool            | ✅        | **Yes → `tx.pure.bool`**  | |
|             | Other string    | ❌        | —                         | Unsupported. |
| `typeArguments` | string type tags | ✅    | No                        | Print as raw strings. |

---

## B. Inputs From Prior Command Outputs (Refs)

> Treat as **transaction handles** unless explicitly known to be primitive.

### splitCoins
| Field     | From prior cmd | Allowed? | Serialize?             | Notes |
|-----------|----------------|----------|------------------------|-------|
| `coin`    | Handle         | ✅        | No                     | Must be a handle. |
| `amounts` | Primitive nums | ✅        | **No (`pure` forbidden)** | |

**Output:** destructure into N scalars.

---

### mergeCoins
| Field        | From prior cmd | Allowed? | Serialize? | Notes |
|--------------|----------------|----------|------------|-------|
| `destination`| Handle         | ✅        | No         | |
| `sources`    | Handle         | ✅        | No         | |

---

### transferObjects
| Field       | From prior cmd | Allowed? | Serialize? | Notes |
|-------------|----------------|----------|------------|-------|
| `objects`   | Handle         | ✅        | No         | |
| `recipient` | —              | —        | —          | Same as variable case. |

---

### makeMoveVec
| Field       | From prior cmd | Allowed? | Serialize? | Notes |
|-------------|----------------|----------|------------|-------|
| `elements`  | Handle(s)      | ✅        | No         | |
|             | Primitive      | ✅        | No         | |

---

### moveCall
| Field       | From prior cmd | Allowed? | Serialize?                  | Notes |
|-------------|----------------|----------|-----------------------------|-------|
| `arguments` | Handle         | ✅        | No                          | Pass-through. |
|             | Primitive      | ✅        | **Yes → `pure`** (same as variable) | |

---

## Mandatory Output & Wiring Rules

- **splitCoins**  
  - Call with `[a, b, c]` literal.  
  - **Always destructure** results into separate vars.  

- **transferObjects**  
  - `recipient` never uses `pure`.  

- **makeMoveVec**  
  - No `pure` for elements.  

- **moveCall**  
  - Strict `pure` for non-handle args.  

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

## Implementation Checklist

- [ ] `splitCoins` → destructure outputs into N scalars.  
- [ ] `splitCoins.amounts` → multiple scalars, never a vector.  
- [ ] `moveCall.arguments` → only place where `pure` is applied.  
- [ ] `transferObjects.recipient` → no `pure`.  
- [ ] `makeMoveVec.elements` → no `pure`.  
- [ ] `moveCall` return values follow policy (0, 1, N).  
- [ ] Codegen and runtime share exact same rules.  
- [ ] Optional: hoist repeated `pure(...)` calls into a const for reuse.  