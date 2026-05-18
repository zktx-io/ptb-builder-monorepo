import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const sourceRoot = fileURLToPath(new URL('../src', import.meta.url));
const sourceFiles = collectSourceFiles(sourceRoot);

const forbiddenImports = [
  {
    label: 'unsupported dapp-kit package',
    matches: ({ specifier }: ImportRecord) => specifier === '@mysten/dapp-kit',
  },
  {
    label: 'JSON-RPC imports',
    matches: ({ specifier }: ImportRecord) =>
      specifier === '@mysten/sui/jsonRpc' ||
      specifier.startsWith('@mysten/sui/jsonRpc/'),
  },
  {
    label: 'SuiClient class import or re-export',
    matches: ({ specifier, statement }: ImportRecord) =>
      specifier === '@mysten/sui/client' &&
      /\b(SuiClient|SuiJsonRpcClient|getJsonRpcFullnodeUrl|getFullnodeUrl)\b/.test(
        statement,
      ),
  },
  {
    label: 'Sui client namespace import or dynamic import',
    matches: ({ specifier, statement }: ImportRecord) =>
      specifier === '@mysten/sui/client' &&
      (/\bimport\s+\*\s+as\b/.test(statement) ||
        /\bimport\s*\(/.test(statement)),
  },
  {
    label: 'Sui client barrel re-export',
    matches: ({ specifier, statement }: ImportRecord) =>
      specifier === '@mysten/sui/client' &&
      /\bexport\s+(?:type\s+)?\*/.test(statement),
  },
  {
    label: 'ptb-model subpath import',
    matches: ({ specifier }: ImportRecord) =>
      specifier.startsWith('@zktx.io/ptb-model/') ||
      /(?:^|[./])ptb-model\/(?:src|dist)\//.test(specifier),
  },
  {
    label: 'deleted builder codegen import',
    matches: ({ specifier }: ImportRecord) =>
      /(?:^|[./])codegen(?:\/|$)/.test(specifier),
  },
  {
    label: 'deleted builder decodeTx import',
    matches: ({ specifier }: ImportRecord) =>
      /(?:^|[./])decodeTx(?:\/|$)/.test(specifier),
  },
];

const forbiddenText = [
  {
    label: 'wallet address sentinel',
    pattern: /\bmyAddress\b|@my_wallet|\bmy wallet\b/,
  },
];

describe('builder source guardrails', () => {
  it('keeps source imports on the model root and SDK Core boundary', () => {
    const violations = sourceFiles.flatMap((file) => {
      const text = readFileSync(file, 'utf8');
      return importViolations(text).map((label) => `${file}: ${label}`);
    });

    expect(violations).toEqual([]);
  });

  it('keeps unsupported sentinel strings out of builder source', () => {
    const violations = sourceFiles.flatMap((file) => {
      const text = readFileSync(file, 'utf8');
      return forbiddenText
        .filter(({ pattern }) => pattern.test(text))
        .map(({ label }) => `${file}: ${label}`);
    });

    expect(violations).toEqual([]);
  });

  it('keeps PtbFlow RF-to-PTB conversion behind one safe boundary', () => {
    const text = readFileSync(join(sourceRoot, 'ui', 'PtbFlow.tsx'), 'utf8');
    const directCalls = [...text.matchAll(/\brfToPTB\s*\(/g)];

    expect(directCalls).toHaveLength(1);
  });

  it('keeps provider UI state focused on visible transaction and notice data', () => {
    const text = readFileSync(
      join(sourceRoot, 'ui', 'providerUiState.ts'),
      'utf8',
    );

    expect(text).not.toMatch(/\bProviderUiMode\b/);
    expect(text).not.toMatch(/\bmode\s*:/);
  });

  it('keeps transaction abort styling on structured status data', () => {
    const text = readFileSync(join(sourceRoot, 'ui', 'StatusBar.tsx'), 'utf8');

    expect(text).toContain('isMoveAbortTransaction(transaction)');
    expect(text).not.toMatch(/\.startsWith\(['"]MoveAbort['"]\)/);
  });

  it('keeps on-chain transaction loading atomic until a decoded graph is ready', () => {
    const text = readFileSync(
      join(sourceRoot, 'ui', 'PtbProvider.tsx'),
      'utf8',
    );
    const start = text.indexOf('const loadFromOnChainTx');
    const end = text.indexOf('// ---- document loader', start);
    const segment = text.slice(start, end);

    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    expect(segment).not.toContain("mode: 'loading-transaction'");
    expect(segment).not.toContain('setReadOnly(false);');
    expect(segment.indexOf('resetBeforeLoad()')).toBeGreaterThan(
      segment.indexOf('const decoded = transactionIRToGraph(ir);'),
    );
    expect(segment).toContain('const nextView = { ...DEFAULT_PTB_VIEW };');
    expect(segment.indexOf('setView(nextView);')).toBeGreaterThan(
      segment.indexOf('resetBeforeLoad()'),
    );
  });

  it('keeps failed replacement transaction loads from clearing the committed viewer transaction', () => {
    const text = readFileSync(
      join(sourceRoot, 'ui', 'PtbProvider.tsx'),
      'utf8',
    );
    const start = text.indexOf('const loadFromOnChainTx');
    const end = text.indexOf('// ---- document loader', start);
    const segment = text.slice(start, end);

    expect(segment).not.toContain(
      'setProviderUiState(providerTransactionLoadError(',
    );
    expect(segment).toContain(
      'setProviderUiState((prev) => providerTransactionLoadError(prev, error));',
    );
  });

  it('treats transaction load attempts as cancellation boundaries before validation', () => {
    const text = readFileSync(
      join(sourceRoot, 'ui', 'PtbProvider.tsx'),
      'utf8',
    );
    const start = text.indexOf('const loadFromOnChainTx');
    const end = text.indexOf('// ---- document loader', start);
    const segment = text.slice(start, end);

    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    expect(
      segment.indexOf("lifecycleRef.current.beginLoad('transaction')"),
    ).toBeLessThan(segment.indexOf('const digest = (txDigest ||'));
    expect(segment).toContain('lifecycleRef.current.fail(load, error);');
  });

  it('makes document load attempts supersede older async loads before validation', () => {
    const text = readFileSync(
      join(sourceRoot, 'ui', 'PtbProvider.tsx'),
      'utf8',
    );
    const start = text.indexOf('const loadFromDoc');
    const end = text.indexOf('// ---- export doc', start);
    const segment = text.slice(start, end);

    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    expect(
      segment.indexOf("lifecycleRef.current.beginLoad('document')"),
    ).toBeLessThan(segment.indexOf('prepareLoadedDoc(value)'));
    expect(
      segment.indexOf("lifecycleRef.current.beginLoad('document')"),
    ).toBeLessThan(segment.indexOf('createEmptyPTBDoc(chain)'));
    expect(segment).toContain('lifecycleRef.current.fail(load, error);');
    expect(segment).toContain('lifecycleRef.current.fail(load, message);');
  });

  it('keeps object-id edits from debouncing rawInput invalidation', () => {
    const text = readFileSync(
      join(sourceRoot, 'ui', 'nodes', 'vars', 'VarNode.tsx'),
      'utf8',
    );

    expect(text).not.toContain('debouncedPatchObjectId');
    expect(text).toContain('objectAuthoringInputChanged(prev, s, seq)');
    expect(text).toMatch(
      /patchVar\(\{\s*value:\s*s,\s*rawInput:\s*undefined,?\s*\}\);/s,
    );
  });

  it('keeps option<bool> authoring on boolean values instead of text strings', () => {
    const text = readFileSync(
      join(sourceRoot, 'ui', 'nodes', 'vars', 'VarNode.tsx'),
      'utf8',
    );

    expect(text).toContain('optionInnerIsBool');
    expect(text).toContain('parseBoolEditorValue');
    expect(text).not.toContain('Option<bool> also uses TextInput');
  });

  it('keeps PTBBuilder wrapper props from changing provider subtree identity', () => {
    const text = readFileSync(join(sourceRoot, 'ui', 'PtbBuilder.tsx'), 'utf8');

    expect(text).toContain('<div className={className} style={style}>');
    expect(text).toContain('<ReactFlowProvider>');
    expect(text).not.toContain(
      'if (className !== undefined || style !== undefined)',
    );
  });

  it('keeps initialChain below explicit host load authority', () => {
    const text = readFileSync(
      join(sourceRoot, 'ui', 'PtbProvider.tsx'),
      'utf8',
    );

    expect(text).toContain('const initialChainLoadRef = useRef(false)');
    expect(text).toContain('const explicitLoadStartedRef = useRef(false)');
    expect(text).toContain('explicitLoadStartedRef.current = true');
    expect(text).toContain('loadFromDocRef.current = loadFromDoc');
    expect(text).toContain('explicitLoadStartedRef.current ||');
    expect(text).toContain('activeChainRef.current');
    expect(text).toMatch(
      /useEffect\(\(\) => \{[\s\S]*loadFromDocRef\.current\(initialChain\);[\s\S]*\}, \[initialChain\]\);/,
    );
    expect(text).not.toContain('}, [initialChain, loadFromDoc]);');
  });

  it('keeps SDK Core object and package lookups on model-canonical ids', () => {
    const text = readFileSync(
      join(sourceRoot, 'ui', 'PtbProvider.tsx'),
      'utf8',
    );

    expect(text).toContain('parseObjectId');
    expect(text).toContain('const id = parseObjectId(rawId);');
    expect(text).toContain(
      'const id = rawPackageId ? parseObjectId(rawPackageId) : undefined;',
    );
    expect(text).not.toContain("id.startsWith('0x')");
  });

  it('keeps option None authoring JSON-stable', () => {
    const text = readFileSync(
      join(sourceRoot, 'ui', 'nodes', 'vars', 'VarNode.tsx'),
      'utf8',
    );

    expect(text).toContain('const OPTION_NONE_VALUE = NULL_VALUE');
    expect(text).toContain('const isNone = val === OPTION_NONE_VALUE');
    expect(text).toContain('value: next ? nextValue : OPTION_NONE_VALUE');
    expect(text).toContain('value: next ? scalarBuf : OPTION_NONE_VALUE');
    expect(text).not.toContain('value: next ? nextValue : undefined');
    expect(text).not.toContain('value: next ? scalarBuf : undefined');
  });

  it('wires option node theme tokens to an emitted node class', () => {
    const varNode = readFileSync(
      join(sourceRoot, 'ui', 'nodes', 'vars', 'VarNode.tsx'),
      'utf8',
    );
    const commonCss = readFileSync(
      join(sourceRoot, 'ui', 'styles', 'common.css'),
      'utf8',
    );

    expect(varNode).toContain('ptb-node--option');
    expect(commonCss).toContain('.ptb-node--option');
    expect(commonCss).toContain('--ptb-node-option-border');
  });

  it('cancels pending pure-value drafts before stronger VarNode semantic writes', () => {
    const text = readFileSync(
      join(sourceRoot, 'ui', 'nodes', 'vars', 'VarNode.tsx'),
      'utf8',
    );

    expect(text).toContain('const cancelPendingPureValueDrafts = useCallback');
    expect(text).toContain('const replaceVectorItems = useCallback');
    expect(text).toMatch(
      /const stepVec = useCallback[\s\S]*cancelPendingPureValueDrafts\(\);[\s\S]*replaceVectorItems\(next\);[\s\S]*patchVar\(\{ value: next \}\);/,
    );
    expect(text).toMatch(
      /onToggle=\{\(next\) => \{[\s\S]*cancelPendingPureValueDrafts\(\);[\s\S]*OPTION_NONE_VALUE/,
    );
    expect(text).toMatch(
      /onChange=\{\(newVal\) => \{[\s\S]*cancelPendingPureValueDrafts\(\);[\s\S]*replaceVectorItems\(next\);[\s\S]*patchVar\(\{ value: next \}\);/,
    );
    expect(text).not.toContain('defer(() => patchVar({ value: next }))');
    expect(text).not.toContain('setVecItems((prev)');
  });

  it('keeps vector<bool> editor buffers type-honest', () => {
    const text = readFileSync(
      join(sourceRoot, 'ui', 'nodes', 'vars', 'VarNode.tsx'),
      'utf8',
    );

    expect(text).toContain('type VectorEditorItem = string | boolean');
    expect(text).toContain('useState<VectorEditorItem[]>');
    expect(text).toContain('parseBoolEditorValue(variableValue ?? scalarBuf)');
    expect(text).toContain('allowUnset');
    expect(text).toContain('onUnset');
    expect(text).toContain('value={variableValue as boolean | undefined}');
    expect(text).not.toContain('newVal as any');
    expect(text).not.toContain('copy as any');
  });

  it('keeps transaction object metadata fetches concurrency-bounded', () => {
    const text = readFileSync(
      join(sourceRoot, 'ui', 'PtbProvider.tsx'),
      'utf8',
    );

    expect(text).toContain('OBJECT_METADATA_FETCH_CONCURRENCY');
    expect(text).toContain('candidateIds.slice(');
    expect(text).not.toContain('candidateIds.map(async');
  });

  it('keeps Variable-node value patches off full RF-to-PTB conversion', () => {
    const text = readFileSync(join(sourceRoot, 'ui', 'PtbFlow.tsx'), 'utf8');
    const start = text.indexOf('const onPatchVar = useCallback');
    const end = text.indexOf(
      '// Keep refs pointing to latest patchers/loaders',
      start,
    );
    const segment = text.slice(start, end);

    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    expect(segment).toContain("if (!('varType' in patch))");
    expect(segment.indexOf('safeRfToPTB(prev)')).toBeGreaterThan(
      segment.indexOf("if (!('varType' in patch))"),
    );
  });

  it('keeps React Flow node callback wrappers stable across unchanged nodes', () => {
    const text = readFileSync(join(sourceRoot, 'ui', 'PtbFlow.tsx'), 'utf8');
    const start = text.indexOf('const nodeDataOnPatchUI = useCallback');
    const end = text.indexOf(
      '// ----- Node-level patchers (deferred to avoid setState in render)',
      start,
    );
    const segment = text.slice(start, end);

    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    expect(segment).toContain('data.onPatchUI === nodeDataOnPatchUI');
    expect(segment).toContain('data.onPatchCommand === nodeDataOnPatchCommand');
    expect(segment).toContain('data.onPatchVar === nodeDataOnPatchVar');
    expect(segment).not.toMatch(/onPatchUI:\s*\(id: string/);
  });

  it('does not expose abstract option<number> authoring helpers', () => {
    const factories = readFileSync(
      join(sourceRoot, 'ptb', 'factories.ts'),
      'utf8',
    );
    const menuActions = readFileSync(
      join(sourceRoot, 'ui', 'menu', 'menu.actions.ts'),
      'utf8',
    );
    const menuData = readFileSync(
      join(sourceRoot, 'ui', 'menu', 'menu.data.tsx'),
      'utf8',
    );

    expect(factories).not.toContain('makeNumberOption');
    expect(menuActions).not.toContain('var/option/number');
    expect(menuData).not.toContain('option<number>');
  });

  it('keeps resource helpers limited to model-semantic gas', () => {
    const factories = readFileSync(
      join(sourceRoot, 'ptb', 'factories.ts'),
      'utf8',
    );
    const seedGraph = readFileSync(
      join(sourceRoot, 'ptb', 'seedGraph.ts'),
      'utf8',
    );
    const menuActions = readFileSync(
      join(sourceRoot, 'ui', 'menu', 'menu.actions.ts'),
      'utf8',
    );
    const menuData = readFileSync(
      join(sourceRoot, 'ui', 'menu', 'menu.data.tsx'),
      'utf8',
    );
    const varNode = readFileSync(
      join(sourceRoot, 'ui', 'nodes', 'vars', 'VarNode.tsx'),
      'utf8',
    );
    const icons = readFileSync(
      join(sourceRoot, 'ui', 'nodes', 'icons', 'index.tsx'),
      'utf8',
    );
    const provider = readFileSync(
      join(sourceRoot, 'ui', 'PtbProvider.tsx'),
      'utf8',
    );

    expect(factories).not.toMatch(/make(?:Clock|Random|System)Object/);
    expect(seedGraph).not.toMatch(/\b(?:CLOCK|RANDOM|SYSTEM)\b/);
    expect(menuActions).not.toMatch(/var\/resource\/(?:clock|random|system)/);
    expect(menuData).not.toMatch(/var\/resource\/(?:clock|random|system)/);
    expect(varNode).toContain("v?.semantic?.kind === 'GasCoin'");
    expect(varNode).not.toContain("new Set(['gas', 'clock'");
    expect(varNode).not.toMatch(/=== ['"]sui['"]/);
    expect(varNode).not.toContain('parseMoveTypeTag');
    expect(icons).toContain("v?.semantic?.kind === 'GasCoin'");
    expect(icons).not.toMatch(/name === ['"]sui['"]/);
    expect(icons).not.toContain('parseMoveTypeTag');
    expect(icons).not.toContain('IconSui');
    expect(icons).not.toMatch(/\bClock\b|\bCog\b|\bDices\b/);
    expect(provider).toContain("node.semantic?.kind === 'GasCoin'");
  });

  it('keeps IO handles memoized and out of full React Flow store subscriptions', () => {
    const text = readFileSync(
      join(sourceRoot, 'ui', 'handles', 'PTBHandleIO.tsx'),
      'utf8',
    );

    expect(text).toContain('useStoreApi');
    expect(text).not.toMatch(/\buseStore\s*\(/);
    expect(text).toContain('export const PTBHandleIO = React.memo');
    expect(text).not.toMatch(/export function PTBHandleIO/);
  });

  it('keeps asset image fallback handling out of write-only React state', () => {
    const text = readFileSync(
      join(sourceRoot, 'ui', 'AssetsModal.tsx'),
      'utf8',
    );

    expect(text).not.toContain('failedImages');
    expect(text).not.toContain('setFailedImages');
  });

  it('keeps SVG data images out of asset image allow-list', () => {
    const text = readFileSync(
      join(sourceRoot, 'ui', 'AssetsModal.tsx'),
      'utf8',
    );

    expect(text).not.toContain("'image/svg+xml'");
  });

  it('keeps asset browsing behind a valid sender address', () => {
    const text = readFileSync(join(sourceRoot, 'ui', 'CodePip.tsx'), 'utf8');

    expect(text).toContain('const assetOwner = useMemo(');
    expect(text).toContain('() => parseObjectId(execOpts.sender)');
    expect(text).toContain('[execOpts.sender]');
    expect(text).toContain('disabled={!assetOwner}');
    expect(text).toContain('open={assetsOpen && !!assetOwner}');
    expect(text).toContain("owner={assetOwner ?? ''}");
    expect(text).not.toContain("owner={execOpts.sender || ''}");
  });

  it('keeps AssetsModal pagination side effects out of React state updaters', () => {
    const text = readFileSync(
      join(sourceRoot, 'ui', 'AssetsModal.tsx'),
      'utf8',
    );
    const start = text.indexOf('const onPrev = () =>');
    const end = text.indexOf('useEffect(() => {', start);
    const segment = text.slice(start, end);

    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    expect(segment).not.toMatch(/setPrevStack\(\(.*loadPage/s);
  });

  it('keeps auto-layout handle parsing aligned with model handle suffixes', () => {
    const text = readFileSync(
      join(sourceRoot, 'ui', 'utils', 'autoLayout.ts'),
      'utf8',
    );

    expect(text).toContain('parseHandleTypeSuffix');
    expect(text).not.toContain("split('|', 1)");
    expect(text).not.toContain('nodeById');
    expect(text).not.toContain('ptbEdge');
    expect(text).not.toContain("startsWith('io:')");
  });

  it('keeps flow topology checks on the shared flow-edge helper', () => {
    const flow = readFileSync(
      join(sourceRoot, 'ui', 'utils', 'flowPath.ts'),
      'utf8',
    );
    const ptbFlow = readFileSync(join(sourceRoot, 'ui', 'PtbFlow.tsx'), 'utf8');
    const autoLayout = readFileSync(
      join(sourceRoot, 'ui', 'utils', 'autoLayout.ts'),
      'utf8',
    );

    expect(flow).toContain('export function isFlowEdge');
    expect(flow).toContain('export function createsFlowLoop');
    expect(flow).not.toContain("startsWith('flow:')");
    expect(flow).not.toContain('ptbEdge');
    expect(ptbFlow).not.toContain('function createsLoop');
    expect(ptbFlow).toContain('createsFlowLoop(filtered');
    expect(ptbFlow).not.toContain('label: cast ?');
    expect(ptbFlow).not.toContain('(e as any).label');
    expect(autoLayout).toContain("import { isFlowEdge } from './flowPath';");
    expect(autoLayout).not.toContain('function isFlowEdge');
  });

  it('keeps read-only React Flow interactions from mutating PTBGraph state', () => {
    const ptbFlow = readFileSync(join(sourceRoot, 'ui', 'PtbFlow.tsx'), 'utf8');
    const provider = readFileSync(
      join(sourceRoot, 'ui', 'PtbProvider.tsx'),
      'utf8',
    );

    expect(ptbFlow).toContain('nodesDraggable={!readOnly}');
    expect(ptbFlow).toContain('edgesReconnectable={false}');
    expect(ptbFlow).toContain("changes.filter((ch) => ch.type === 'select')");
    expect(ptbFlow).toContain('if (readOnly) return;');
    expect(provider).toContain(
      'if (!hadOnDocChange && hasOnDocChange && !readOnly)',
    );
  });

  it('keeps MakeMoveVec authoring exposed with a runtime type editor', () => {
    const menuData = readFileSync(
      join(sourceRoot, 'ui', 'menu', 'menu.data.tsx'),
      'utf8',
    );
    const baseCommand = readFileSync(
      join(sourceRoot, 'ui', 'nodes', 'cmds', 'BaseCommand', 'BaseCommand.tsx'),
      'utf8',
    );

    expect(menuData).toContain("action: 'cmd/makeMoveVec'");
    expect(baseCommand).toContain('aria-label="MakeMoveVec type"');
    expect(baseCommand).toContain('toPTBTypeFromConcreteTypeArgument');
  });

  it('keeps asset picker items keyboard reachable', () => {
    const assetsModal = readFileSync(
      join(sourceRoot, 'ui', 'AssetsModal.tsx'),
      'utf8',
    );

    expect(assetsModal).toContain('className="ptb-modal__grid-item"');
    expect(assetsModal).toContain('className="ptb-modal__item"');
    expect(assetsModal).toContain('type="button"');
  });

  it('keeps context menu submenus keyboard-addressable', () => {
    const contextMenu = readFileSync(
      join(sourceRoot, 'ui', 'menu', 'ContextMenu.tsx'),
      'utf8',
    );

    expect(contextMenu).toContain('data-submenu-trigger="vector"');
    expect(contextMenu).toContain('data-submenu="vector"');
    expect(contextMenu).toContain("case 'ArrowRight'");
    expect(contextMenu).toContain("case 'ArrowLeft'");
    expect(contextMenu).toContain('aria-expanded={openSubmenu ===');
  });

  it('does not let PTBFlow own the module-global factory id generator', () => {
    const text = readFileSync(join(sourceRoot, 'ui', 'PtbFlow.tsx'), 'utf8');

    expect(text).not.toContain('setIdGenerator');
  });

  it('does not force refresh Move function metadata on normal Use clicks', () => {
    const text = readFileSync(
      join(
        sourceRoot,
        'ui',
        'nodes',
        'cmds',
        'MoveCallCommand',
        'MoveCallCommand.tsx',
      ),
      'utf8',
    );

    expect(text).not.toContain('forceRefresh: true');
    expect(text).toContain('lookupSeqRef');
  });

  it('keeps unsupported source folders absent', () => {
    expect(existsSync(join(sourceRoot, 'codegen'))).toBe(false);
    expect(existsSync(join(sourceRoot, 'legacy'))).toBe(false);
    expect(existsSync(join(sourceRoot, 'ptb', 'decodeTx'))).toBe(false);
    expect(
      existsSync(
        join(sourceRoot, 'ui', 'nodes', 'vars', 'inputs', 'SmallSelect.tsx'),
      ),
    ).toBe(false);
    expect(
      readFileSync(
        join(sourceRoot, 'ptb', 'move', 'toPTBModuleData.ts'),
        'utf8',
      ),
    ).not.toContain('export function toPTBModuleData');
    expect(
      readFileSync(join(sourceRoot, 'ptb', 'portTemplates.ts'), 'utf8'),
    ).not.toContain('export const UNKNOWN');
    expect(
      readFileSync(join(sourceRoot, 'ptb', 'registry.ts'), 'utf8'),
    ).not.toContain('export function isGraphOnly');
    expect(
      readFileSync(join(sourceRoot, 'ptb', 'suiClient.ts'), 'utf8'),
    ).not.toContain('export function chainToSuiNetwork');
    expect(
      readFileSync(
        join(sourceRoot, 'ui', 'nodes', 'cmds', 'commandLayout.ts'),
        'utf8',
      ),
    ).not.toContain('export function splitIO');
  });

  it('keeps internal-only helper exports from resurfacing', () => {
    const graphTypes = readFileSync(
      join(sourceRoot, 'ptb', 'graph', 'types.ts'),
      'utf8',
    );
    const ptbDoc = readFileSync(join(sourceRoot, 'ptb', 'ptbDoc.ts'), 'utf8');
    const metadataCache = readFileSync(
      join(sourceRoot, 'ptb', 'metadataCache.ts'),
      'utf8',
    );

    expect(graphTypes).not.toContain('export const findPort');
    expect(graphTypes).not.toContain('export const portIdOf');
    expect(ptbDoc).not.toContain('export function isPTBDoc');
    expect(ptbDoc).not.toContain('export function isPTBModulesEmbed');
    expect(ptbDoc).not.toContain('export function isPTBObjectsEmbed');
    expect(metadataCache).not.toContain('export function getCachedObjectData');
    expect(metadataCache).not.toContain('export function getCachedObjects');
    expect(metadataCache).not.toContain('export function getCachedModules');
    expect(metadataCache).not.toContain('export function replaceCachedObjects');
    expect(metadataCache).not.toContain('export function replaceCachedModules');
  });

  it('checks import and export specifiers without flagging comments or strings', () => {
    expect(
      importViolations(`
        const message = 'Do not import ptb-model/src or getFullnodeUrl here';
        // A compatibility note may mention @mysten/sui/jsonRpc without importing it.
      `),
    ).toEqual([]);
    expect(
      importViolations(`
        import type {
          /* SuiClient was replaced by the Core-compatible client type. */
          ClientWithCoreApi,
        } from '@mysten/sui/client';
      `),
    ).toEqual([]);
  });

  it('still rejects forbidden import and export forms', () => {
    expect(
      importViolations(
        "import { SuiClient as Foo } from '@mysten/sui/client';",
      ),
    ).toContain('SuiClient class import or re-export');
    expect(
      importViolations("const sui = await import('@mysten/sui/client');"),
    ).toContain('Sui client namespace import or dynamic import');
    expect(importViolations("export * from '@mysten/sui/client';")).toContain(
      'Sui client barrel re-export',
    );
    expect(
      importViolations(
        "import { rawTransactionToIR } from '@zktx.io/ptb-model/raw';",
      ),
    ).toContain('ptb-model subpath import');
    expect(
      importViolations("import { preprocess } from '../codegen/preprocess';"),
    ).toContain('deleted builder codegen import');
    expect(
      importViolations("import { decodeTx } from '../ptb/decodeTx';"),
    ).toContain('deleted builder decodeTx import');
  });
});

type ImportRecord = {
  statement: string;
  specifier: string;
};

function importViolations(text: string): string[] {
  return collectImportRecords(text).flatMap((record) =>
    forbiddenImports
      .filter(({ matches }) => matches(record))
      .map(({ label }) => label),
  );
}

function collectImportRecords(text: string): ImportRecord[] {
  const records: ImportRecord[] = [];
  const patterns = [
    /\bimport\s+(?:type\s+)?(?:[^'";]*?\s+from\s+)?['"]([^'"]+)['"]/g,
    /\bexport\s+(?:type\s+)?(?:\*|\{[^}]*\})\s+from\s+['"]([^'"]+)['"]/g,
    /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  ];

  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      records.push({
        statement: stripImportComments(match[0]),
        specifier: match[1],
      });
    }
  }

  return records;
}

function stripImportComments(value: string): string {
  return value.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n\r]*/g, '');
}

function collectSourceFiles(root: string): string[] {
  return readdirSync(root).flatMap((entry) => {
    const path = join(root, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) return collectSourceFiles(path);
    return /\.(ts|tsx)$/.test(path) ? [path] : [];
  });
}
