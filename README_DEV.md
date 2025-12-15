PTB Builder — Developer Documentation

This document is intended for contributors and maintainers. It describes internal architecture, policies, constraints, and TODOs that govern PTB Builder development.

Conventions
	•	UI/logic separation is strict: Provider & Headless logic are not mutated from UI directly.
	•	All network strings use the form sui:<network> where <network> ∈ mainnet|testnet|devnet.

1) Architecture Overview

Runtime model
	•	RF is authoritative while the editor is open.
	•	PTB Graph is a persisted snapshot.
	•	RF → PTB sync happens immediately (no debounce). Only viewport changes are debounced (250ms).
	•	PTB → RF sync happens only when graphEpoch changes (programmatic rehydrate), guarded by rehydratingRef.
	•	Feedback-loop guards
	•	stableGraphSig(g) removes RF-only fields and builds an order-insensitive signature to ignore no-op updates.
	•	suppressNotifyRef prevents autosave callbacks during bulk reloads (doc/chain loads).
	•	replaceGraphImmediate() resets signature, bumps graphEpoch, and rehydrates RF once per load.
	•	Monotonic IDs
	•	createUniqueId() uses a nonce seeded by seedNonceFromGraph() to keep IDs stable across loads.

Core modules
	•	PtbProvider: Context, chain/client management, caches, persistence, execution adapters, debounced notifies.
	•	PTBFlow: RF editing, validation, pruning, auto-layout, code preview triggers, execute/dry-run integrations.
	•	CodePip: Code preview panel (copy, optional export, assets, dry-run, execute, theme switch).
	•	AssetsModal: Owner’s on-chain objects picker, feeds onAssetPick.
	•	Headless (ptb/*): graph schema/types, type system, adapter (RF↔PTB), codegen, on-chain decoder.

Network & Client
	•	activeChain: Chain stored in Provider; SuiClient is (re)built via getFullnodeUrl(activeChain.split(':')[1]).
	•	Editors should validate dropped docs with /^sui:(mainnet|testnet|devnet)$/ before switching networks.
	•	Viewer (loadFromOnChainTx) fetches a local client per chain, preloads modules/objects, then replaces the graph in read-only mode.

2) Policies

Start / End nodes
	•	Exactly one Start and one End must exist.
	•	normalizeGraph coalesces duplicates to canonical IDs KNOWN_IDS.START/KNOWN_IDS.END.
	•	These nodes cannot be deleted (guarded in UI change handlers & context menu).

Handles & Connections
	•	Flow edges
	•	Direction: out → in only, strictly 1:1 per handle.
	•	No self-loops. createsLoop() blocks cycles.
	•	Conflicts resolved by filterHandleConflictsForFlow().
	•	IO edges
	•	Source fan-out allowed; target is single.
	•	Type-checked via isTypeCompatible(); unknown types are ignored (non-connecting).
	•	Conflicts resolved by filterHandleConflictsForIO().
	•	Pruning
	•	pruneDanglingEdges() drops edges whose handles no longer exist after UI changes.
	•	pruneIncompatibleIOEdges() drops IO edges that became type-incompatible.

Vectors & Options
	•	Vectors: scalars only (numbers/strings/bool/address). Objects/coins are not allowed.
	•	Options: tx.option only for scalars. Objects/coins are not allowed.
	•	UI prevents disallowed constructs; code paths are kept flexible for future extension (see TODOs).

3) Constraints

Graph structure
	•	No cycles (enforced at connect time for flow edges).
	•	Disconnected nodes (no Start→…→End path) are deferred from codegen.

Code generation
	•	Deterministic, minimal output.
	•	Skip declarations for IO edges without a concrete source.
	•	Edges connecting two commands avoid redundant intermediate vars when possible.
	•	Cast labels for IO edges are reflected as label = "as <type>" when inferCastTarget applies.

UI & Modes
	•	Read-only mode (e.g., viewer):
	•	No context menu.
	•	No new connections or edits; dragging allowed for inspection.
	•	Themes
	•	Initial theme via props; users can switch at runtime.
	•	Supported: dark, light, cobalt2, tokyo-night, cream, mint-breeze.

4) Provider Details

Props (internal)
	•	initialTheme: Theme — initial theme injected to <html> via data-ptb-theme and dark class.
	•	showThemeSelector?: boolean — controls visibility of theme dropdown in CodePip. Default true.
	•	execOpts?: ExecOptions — { myAddress?: string; gasBudget?: number } used by codegen & tx build.
	•	executeTx?: (chain, tx?) => Promise<{ digest?: string; error?: string }> — external runner.
	•	toast?: ToastAdapter — if absent, falls back to console logging.
	•	showExportButton?: boolean — UI feature flag consumed by CodePip to show/hide Export .ptb button. Default false.

Context (selected highlights)
	•	chain: Chain, theme: Theme, readOnly: boolean.
	•	Caches: objects: PTBObjectsEmbed, modules: PTBModulesEmbed with loaders (getObjectData, getPackageModules).
	•	Persistence: exportDoc({ sender? }), loadFromDoc(doc), loadFromOnChainTx(chain, digest).
	•	Execution: dryRunTx(tx?) (build+simulate), runTx(tx?) (simulate then execute via executeTx).
	•	Layout: registerFlowActions({ autoLayoutAndFit? }) to trigger layout from Provider-managed operations.

Debounced notifications
	•	Graph autosave: RF→PTB snapshot happens immediately (no debounce), suppressed during reloads.
	•	Doc autosave: PTBDoc-level autosave fires immediately for graph/modules/objects/chain changes. Viewport changes are debounced (250ms).

5) PTBFlow Details
	•	RF state is the single source of truth; PTB snapshot is derived.
	•	Rehydrate on graphEpoch only; rehydratingRef mutes RF callbacks during programmatic updates.
	•	Auto‑layout writes positions only; performs a single fitView() after positions are ready to avoid flicker.
	•	Code preview (CodePip) updates on RF diffs; empty graphs show EMPTY_CODE(chain).
	•	Execute/Dry‑run are gated: disabled in read‑only; execute buttons honor a shared isRunning flag.

6) CodePip Details
	•	Features: Copy, optional Export, Asset picker, Dry‑run, Execute, Theme switch, Collapsible.
	•	Export button visibility
	•	Controlled by Provider flag showExportButton (from <PTBBuilder showExportButton />).
	•	Default hidden; visible only when explicitly enabled by integrators.
	•	Asset picker is hidden in read‑only mode.

7) Testing Guidelines (Minimum)
	•	Validator: Allowed/denied connections incl. type and role rules.
	•	Round‑trip: Graph ↔ Export ↔ Import equivalence (structural & semantic).
	•	Plan Builder: Start→End ordering; disconnected node deferral behavior.
	•	Parser: On‑chain sample → Graph reconstruction.
	•	Editor (UI): Drag/connect/context‑menu/drop/validation snapshots.
	•	Adapters: web/localStorage, vscode/postMessage mocking.

8) Security

Input Validation
	•	Address validation (isHexAddr): Limited to 64 hex chars (32 bytes) to prevent DoS attacks.
	•	Decimal validation (isDecString): Limited to 78 digits (max u256 range).
	•	Package ID validation (isValidPackageId): Same format as addresses, enforced length limit.

Recursion Limits
	•	Type checking functions (isPureType, isSameType, isTypeCompatible, inferCastTarget): MAX_TYPE_DEPTH = 32 to prevent stack overflow.
	•	Serialized type unwrapping (unwrapToBase): Hardcoded limit of 8 wrapper levels.

Known Constraints
	•	Dependency vulnerabilities: 13 npm packages with known issues (tracked for Sui SDK gRPC migration).
	•	Sui address checksums: Not yet validated (deferred to gRPC migration).

9) TODOs / Open Decisions
	•	MakeMoveVec node
	•	Currently limited in UI.
	•	Define codegen policy and typechecking, including expanded vs. vector handles.
	•	Vector of objects/coins
	•	Disallowed in UI; code paths are flexible. Decide feasibility & safety constraints.
	•	Option
	•	Currently disallowed; evaluate real‑world demand and safety.
	•	Nested vectors (e.g., vector<vector<u64>>)
	•	Unsupported; keep UI prevention. Decide long‑term spec.
	•	UI feature flags
	•	Generalize to uiOptions (e.g., { export: true, assets: true, dryRun: true }) if more toggles appear.
