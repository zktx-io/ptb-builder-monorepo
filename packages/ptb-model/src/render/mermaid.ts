import { errorDiagnostic as modelDiagnostic } from '../ir/diagnostics.js';
import type {
  DiagnosticCategory,
  TransactionDiagnostic,
} from '../ir/diagnostics.js';
import {
  irCommandArgRefs,
  irObjectId,
  irResolvedObjectArg,
} from '../ir/types.js';
import type {
  IRArgRef,
  IRCommand,
  IRInput,
  TransactionIR,
} from '../ir/types.js';
import { validateTransactionIR } from '../ir/validate.js';
import { isRawFundsWithdrawalArg } from '../raw/types.js';
import type { RawObjectArg } from '../raw/types.js';
import { isDenseArray, isRecord, NULL_VALUE } from '../utils.js';

function renderDiagnostic(
  code: string,
  category: DiagnosticCategory,
  message: string,
  path?: string,
): TransactionDiagnostic {
  return modelDiagnostic(code, category, message, path);
}

export type MermaidDirection = 'TD' | 'LR';

export interface TransactionIRToMermaidOptions {
  direction?: MermaidDirection;
  showInputValues?: boolean;
  showArgumentValues?: boolean;
  shortenLabels?: boolean;
  theme?: 'none' | 'semantic';
}

const MERMAID_OPTION_FIELDS = [
  'direction',
  'showInputValues',
  'showArgumentValues',
  'shortenLabels',
  'theme',
] as const;

export function transactionIRToMermaid(
  ir: TransactionIR,
  options: TransactionIRToMermaidOptions = {},
): string {
  const optionDiagnostics = validateMermaidOptions(options);
  const renderOptions = isRecord(options)
    ? (options as TransactionIRToMermaidOptions)
    : {};
  const source: Record<string, unknown> = isRecord(ir) ? ir : {};
  const renderIR: TransactionIR = {
    version:
      source.version === 'transaction_ir_1'
        ? source.version
        : 'transaction_ir_1',
    inputs: isDenseArray(source.inputs) ? (source.inputs as IRInput[]) : [],
    commands: isDenseArray(source.commands)
      ? (source.commands as IRCommand[])
      : [],
    diagnostics: [
      ...optionDiagnostics,
      ...validateTransactionIR(ir, {
        includeExistingDiagnostics: true,
      }),
    ],
  };
  const direction =
    renderOptions.direction === 'TD' || renderOptions.direction === 'LR'
      ? renderOptions.direction
      : 'TD';
  const theme =
    renderOptions.theme === 'none' || renderOptions.theme === 'semantic'
      ? renderOptions.theme
      : 'none';
  const lines = [`flowchart ${direction}`];
  const showArgumentValues =
    typeof renderOptions.showArgumentValues === 'boolean'
      ? renderOptions.showArgumentValues
      : false;
  const showInputValues =
    typeof renderOptions.showInputValues === 'boolean'
      ? renderOptions.showInputValues
      : true;
  const shortenLabels =
    typeof renderOptions.shortenLabels === 'boolean'
      ? renderOptions.shortenLabels
      : false;
  const hasGasCoin = renderIR.commands.some((command) =>
    irCommandArgRefs(command).some((arg) => arg.kind === 'GasCoin'),
  );

  renderIR.diagnostics.forEach((diagnostic, index) => {
    lines.push(`  diag${index}["${mermaidNodeLabel([diagnostic.code])}"]`);
  });

  renderIR.inputs.forEach((input, index) => {
    lines.push(
      `  input${index}["${mermaidNodeLabel(
        inputNodeLabel(input, index, showInputValues, shortenLabels),
      )}"]`,
    );
  });

  if (hasGasCoin) {
    lines.push(`  gas["GasCoin"]`);
  }

  renderIR.commands.forEach((command, index) => {
    lines.push(
      `  command${index}["${mermaidNodeLabel(
        commandLabel(command, index, shortenLabels),
      )}"]`,
    );
  });

  const commandSequenceLinkIndexes: number[] = [];
  for (let index = 0; index < renderIR.commands.length - 1; index += 1) {
    commandSequenceLinkIndexes.push(index);
    lines.push(`  command${index} -- then --> command${index + 1}`);
  }

  renderIR.commands.forEach((command, index) => {
    irCommandArgRefs(command).forEach((arg) => {
      const sourceNode = argSourceNodeId(renderIR, arg, hasGasCoin);
      if (!sourceNode) return;
      const edge = showArgumentValues
        ? ` -- "${escapeMermaid(argValueLabel(renderIR, arg, shortenLabels))}" --> `
        : ' --> ';
      lines.push(`  ${sourceNode}${edge}command${index}`);
    });
  });

  const commandNodeIds = renderIR.commands.map(
    (_command, index) => `command${index}`,
  );
  if (commandNodeIds.length > 0) {
    lines.push(
      '  classDef commandOutline stroke-width:3px',
      `  class ${commandNodeIds.join(',')} commandOutline`,
    );
  }
  if (commandSequenceLinkIndexes.length > 0) {
    lines.push(
      `  linkStyle ${commandSequenceLinkIndexes.join(',')} stroke-width:3px`,
    );
  }

  if (theme === 'semantic') {
    lines.push(
      '  classDef diagnostic fill:#fef2f2,stroke:#dc2626,color:#7f1d1d',
      '  classDef input fill:#eff6ff,stroke:#2563eb,color:#111827',
      '  classDef gas fill:#fefce8,stroke:#ca8a04,color:#713f12',
      '  classDef moveCall fill:#ecfdf5,stroke:#059669,color:#064e3b',
      '  classDef transfer fill:#fff7ed,stroke:#ea580c,color:#7c2d12',
      '  classDef coin fill:#f5f3ff,stroke:#7c3aed,color:#3b0764',
      '  classDef package fill:#fdf2f8,stroke:#db2777,color:#831843',
      '  classDef vector fill:#f0fdfa,stroke:#0d9488,color:#134e4a',
      '  classDef unsupported fill:#f3f4f6,stroke:#6b7280,color:#374151',
    );
    if (renderIR.diagnostics.length > 0) {
      lines.push(
        `  class ${renderIR.diagnostics.map((_diagnostic, index) => `diag${index}`).join(',')} diagnostic`,
      );
    }
    if (renderIR.inputs.length > 0) {
      lines.push(
        `  class ${renderIR.inputs.map((_input, index) => `input${index}`).join(',')} input`,
      );
    }
    if (hasGasCoin) {
      lines.push('  class gas gas');
    }
    const commandClasses = groupedCommandClasses(renderIR.commands);
    commandClasses.forEach((nodeIds, className) => {
      lines.push(`  class ${nodeIds.join(',')} ${className}`);
    });
  }

  return `${lines.join('\n')}\n`;
}

function validateMermaidOptions(
  options: unknown,
): readonly TransactionDiagnostic[] {
  const diagnostics: TransactionDiagnostic[] = [];
  if (options === undefined) return diagnostics;
  if (!isRecord(options)) {
    diagnostics.push(
      renderDiagnostic(
        'mermaid.options',
        'shape',
        'Mermaid options must be an object when provided.',
        '$.options',
      ),
    );
    return diagnostics;
  }
  Object.keys(options)
    .filter(
      (key) => !(MERMAID_OPTION_FIELDS as readonly string[]).includes(key),
    )
    .forEach((key) => {
      diagnostics.push(
        renderDiagnostic(
          'mermaid.options.unknownField',
          'shape',
          `Mermaid options do not support field ${key}.`,
          `$.options.${key}`,
        ),
      );
    });
  if (
    options.direction !== undefined &&
    options.direction !== 'TD' &&
    options.direction !== 'LR'
  ) {
    diagnostics.push(
      renderDiagnostic(
        'mermaid.direction',
        'shape',
        'Mermaid direction must be TD or LR.',
        '$.options.direction',
      ),
    );
  }
  if (
    options.theme !== undefined &&
    options.theme !== 'none' &&
    options.theme !== 'semantic'
  ) {
    diagnostics.push(
      renderDiagnostic(
        'mermaid.theme',
        'shape',
        'Mermaid theme must be none or semantic.',
        '$.options.theme',
      ),
    );
  }
  if (
    options.showArgumentValues !== undefined &&
    typeof options.showArgumentValues !== 'boolean'
  ) {
    diagnostics.push(
      renderDiagnostic(
        'mermaid.showArgumentValues',
        'shape',
        'Mermaid showArgumentValues must be boolean.',
        '$.options.showArgumentValues',
      ),
    );
  }
  if (
    options.showInputValues !== undefined &&
    typeof options.showInputValues !== 'boolean'
  ) {
    diagnostics.push(
      renderDiagnostic(
        'mermaid.showInputValues',
        'shape',
        'Mermaid showInputValues must be boolean.',
        '$.options.showInputValues',
      ),
    );
  }
  if (
    options.shortenLabels !== undefined &&
    typeof options.shortenLabels !== 'boolean'
  ) {
    diagnostics.push(
      renderDiagnostic(
        'mermaid.shortenLabels',
        'shape',
        'Mermaid shortenLabels must be boolean.',
        '$.options.shortenLabels',
      ),
    );
  }
  return diagnostics;
}

function argSourceNodeId(
  ir: TransactionIR,
  arg: IRArgRef,
  hasGasCoin: boolean,
): string | undefined {
  switch (arg.kind) {
    case 'Input':
      return isExistingIndex(arg.index, ir.inputs.length)
        ? `input${arg.index}`
        : undefined;
    case 'Result':
    case 'NestedResult':
      return isExistingIndex(arg.commandIndex, ir.commands.length)
        ? `command${arg.commandIndex}`
        : undefined;
    case 'GasCoin':
      return hasGasCoin ? 'gas' : undefined;
  }
}

function isExistingIndex(value: number, length: number): boolean {
  return Number.isSafeInteger(value) && value >= 0 && value < length;
}

function inputNodeLabel(
  input: unknown,
  index: number,
  showInputValues: boolean,
  shortenLabels: boolean,
): string[] {
  const kind = inputKindLabel(input);
  const lines = [`Input ${index}: ${kind}`];
  if (showInputValues) {
    lines.push(inputNodeValueLabel(input, shortenLabels));
  }
  return lines;
}

function inputKindLabel(input: unknown): string {
  if (!isRecord(input) || typeof input.kind !== 'string') {
    return 'Invalid';
  }
  if (input.kind !== 'Object' || !isRecord(input.source)) {
    return input.kind;
  }
  const object = irResolvedObjectArg(
    input as Extract<IRInput, { kind: 'Object' }>,
  );
  return object ? `Object (${objectKindLabel(object)})` : 'Object';
}

function commandLabel(
  command: unknown,
  index: number,
  shortenLabels: boolean,
): string[] {
  if (!isRecord(command) || typeof command.kind !== 'string') {
    return [`${index}: InvalidCommand`];
  }

  switch (command.kind) {
    case 'MoveCall': {
      return [
        `${index}: MoveCall ${labelValue(command.package, {
          shortenLabels,
        })}::${labelValue(command.module)}::${labelValue(command.function)}`,
      ];
    }
    case 'TransferObjects':
      return [`${index}: TransferObjects`];
    case 'SplitCoins':
      return [`${index}: SplitCoins`];
    case 'MergeCoins':
      return [`${index}: MergeCoins`];
    case 'Publish':
      return [`${index}: Publish`];
    case 'MakeMoveVec':
      return [`${index}: MakeMoveVec`];
    case 'Upgrade':
      return [
        `${index}: Upgrade ${labelValue(command.package, { shortenLabels })}`,
      ];
    case 'Unsupported':
      return [`${index}: Unsupported ${labelValue(command.sourceKind)}`];
    default:
      return [`${index}: UnsupportedCommand ${command.kind}`];
  }
}

function groupedCommandClasses(commands: IRCommand[]): Map<string, string[]> {
  const result = new Map<string, string[]>();
  commands.forEach((command, index) => {
    const className = commandClass(command);
    const nodeIds = result.get(className);
    if (nodeIds) {
      nodeIds.push(`command${index}`);
    } else {
      result.set(className, [`command${index}`]);
    }
  });
  return result;
}

function commandClass(command: unknown): string {
  if (!isRecord(command) || typeof command.kind !== 'string') {
    return 'unsupported';
  }

  switch (command.kind) {
    case 'MoveCall':
      return 'moveCall';
    case 'TransferObjects':
      return 'transfer';
    case 'SplitCoins':
    case 'MergeCoins':
      return 'coin';
    case 'Publish':
    case 'Upgrade':
      return 'package';
    case 'MakeMoveVec':
      return 'vector';
    case 'Unsupported':
    default:
      return 'unsupported';
  }
}

function argValueLabel(
  ir: TransactionIR,
  arg: IRArgRef,
  shortenLabels: boolean,
): string {
  switch (arg.kind) {
    case 'GasCoin':
      return 'GasCoin';
    case 'Input': {
      const input = ir.inputs[arg.index];
      return input
        ? `input ${arg.index}: ${inputValueLabel(input, shortenLabels)}`
        : `missing input ${arg.index}`;
    }
    case 'Result':
      return `result command ${arg.commandIndex}`;
    case 'NestedResult':
      return `result command ${arg.commandIndex}[${arg.resultIndex}]`;
  }
}

function inputValueLabel(input: unknown, shortenLabels: boolean): string {
  if (!isRecord(input) || typeof input.kind !== 'string') {
    return 'invalid input';
  }

  switch (input.kind) {
    case 'Pure':
      if (Object.prototype.hasOwnProperty.call(input, 'value')) {
        return `value ${formatLongLabel(
          renderMermaidValue(input.value),
          shortenLabels,
        )}`;
      }
      return typeof input.bytes === 'string'
        ? `bytes ${formatLongLabel(input.bytes, shortenLabels)}`
        : 'bytes unavailable';
    case 'Object': {
      if (!isRecord(input.source)) {
        return 'invalid object';
      }
      const objectInput = input as Extract<IRInput, { kind: 'Object' }>;
      const object = irResolvedObjectArg(objectInput);
      return object
        ? objectValueLabel(object, shortenLabels)
        : `Object ${formatObjectIdLabel(irObjectId(objectInput), shortenLabels)}`;
    }
    case 'FundsWithdrawal':
      if (!isRawFundsWithdrawalArg(input.value)) {
        return 'invalid funds withdrawal';
      }
      return `withdraw ${input.value.reservation.amount} ${formatLongLabel(
        input.value.typeArg.type,
        shortenLabels,
      )} from ${input.value.withdrawFrom.kind}`;
    case 'Unsupported':
      return `unsupported ${input.sourceKind}`;
    default:
      return `unsupported ${input.kind}`;
  }
}

function inputNodeValueLabel(input: unknown, shortenLabels: boolean): string {
  if (!isRecord(input) || input.kind !== 'Object') {
    return inputValueLabel(input, shortenLabels);
  }
  if (!isRecord(input.source)) {
    return 'invalid object';
  }
  const objectInput = input as Extract<IRInput, { kind: 'Object' }>;
  const object = irResolvedObjectArg(objectInput);
  return object
    ? objectNodeValueLabel(object, shortenLabels)
    : formatObjectIdLabel(irObjectId(objectInput), shortenLabels);
}

function renderMermaidValue(value: unknown): string {
  if (!Array.isArray(value) && !isRecord(value)) return String(value);
  const seen = new WeakSet<object>();
  try {
    const rendered = JSON.stringify(value, (_key, item) => {
      if (typeof item === 'bigint') return item.toString();
      if (typeof item === 'function') return '[Function]';
      if (typeof item === 'symbol') return item.toString();
      if (typeof item === 'object' && item !== NULL_VALUE) {
        if (seen.has(item)) return '[Circular]';
        seen.add(item);
      }
      return item;
    });
    return typeof rendered === 'string' ? rendered : String(value);
  } catch {
    return String(value);
  }
}

function objectValueLabel(
  object: RawObjectArg,
  shortenLabels: boolean,
): string {
  return `Object (${objectKindLabel(object)}) ${objectNodeValueLabel(
    object,
    shortenLabels,
  )}`;
}

function objectKindLabel(
  object: RawObjectArg,
): 'Owned' | 'Shared' | 'Receiving' {
  switch (object.kind) {
    case 'ImmOrOwnedObject':
      return 'Owned';
    case 'SharedObject':
      return 'Shared';
    case 'Receiving':
      return 'Receiving';
  }
}

function objectNodeValueLabel(
  object: RawObjectArg,
  shortenLabels: boolean,
): string {
  switch (object.kind) {
    case 'ImmOrOwnedObject':
    case 'Receiving':
      return formatObjectIdLabel(object.objectId, shortenLabels);
    case 'SharedObject':
      return `${formatObjectIdLabel(object.objectId, shortenLabels)} ${
        object.mutable ? 'mutable' : 'immutable'
      }`;
  }
}

function formatObjectIdLabel(value: string, shortenLabels: boolean): string {
  return shortenLabels ? shortId(value) : value;
}

function formatLongLabel(value: string, shortenLabels: boolean): string {
  return shortenLabels ? shorten(value) : value;
}

function shortId(value: string): string {
  if (value.length <= 18) {
    return value;
  }
  return `${value.slice(0, 10)}...${value.slice(-6)}`;
}

function shorten(value: string): string {
  return value.length <= 32 ? value : `${value.slice(0, 29)}...`;
}

function mermaidNodeLabel(lines: string[]): string {
  return lines.map((line) => escapeMermaid(line)).join('<br/>');
}

function labelValue(
  value: unknown,
  options: { shortenLabels?: boolean } = {},
): string {
  if (typeof value !== 'string') return 'unknown';
  return options.shortenLabels ? formatObjectIdLabel(value, true) : value;
}

function escapeMermaid(value: string): string {
  let escaped = '';
  const normalized = value.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  for (const char of normalized) {
    if (char === '\n') {
      escaped += '<br/>';
      continue;
    }
    if (char === '\t') {
      escaped += ' ';
      continue;
    }

    const codePoint = char.codePointAt(0) ?? 0;
    if (isUnsafeMermaidControl(codePoint)) {
      escaped += `[U+${codePoint.toString(16).toUpperCase().padStart(4, '0')}]`;
      continue;
    }

    escaped += escapeMermaidTextChar(char);
  }
  return escaped;
}

function escapeMermaidTextChar(value: string): string {
  switch (value) {
    case '&':
      return '&amp;';
    case '<':
      return '&lt;';
    case '>':
      return '&gt;';
    case '\\':
      return '\\\\';
    case '"':
      return '&quot;';
    default:
      return value;
  }
}

function isUnsafeMermaidControl(codePoint: number): boolean {
  return (
    (codePoint >= 0x00 && codePoint <= 0x1f) ||
    codePoint === 0x7f ||
    (codePoint >= 0x80 && codePoint <= 0x9f) ||
    (codePoint >= 0xd800 && codePoint <= 0xdfff) ||
    codePoint === 0x200b ||
    codePoint === 0x200c ||
    codePoint === 0x200d ||
    codePoint === 0x200e ||
    codePoint === 0x200f ||
    (codePoint >= 0x2028 && codePoint <= 0x202e) ||
    codePoint === 0x2060 ||
    (codePoint >= 0x2066 && codePoint <= 0x2069) ||
    codePoint === 0xfeff
  );
}
