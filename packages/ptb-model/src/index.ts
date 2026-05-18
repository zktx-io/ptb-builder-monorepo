export {
  freezeDiagnostics,
  hasErrors,
  PTBModelError,
} from './ir/diagnostics.js';
export type { TransactionDiagnostic } from './ir/diagnostics.js';

export {
  detectPTBDocVersion,
  parsePTBDocV4,
  PTB_DOC_VERSION_V4,
  validatePTBDocV4,
} from './doc/index.js';
export type { PTBDocV4 } from './doc/index.js';
export type { PTBDocVersion } from './doc/index.js';

export type {
  CommandKind,
  CommandNode,
  CommandRuntimeParams,
  CommandUIParams,
  EdgeKind,
  EndNode,
  NodeBase,
  Port,
  PortDirection,
  PortRole,
  PTBEdge,
  PTBGraph,
  PTBNode,
  StartNode,
  VariableNode,
} from './graph/types.js';
export { validatePTBGraph } from './graph/types.js';
export type { NumericWidth, PTBScalar, PTBType } from './ptbType.js';
export { isPTBType, validatePTBType } from './ptbType.js';
export type { IndexedHandleSuffix } from './graph/handles.js';
export {
  indexedHandleSuffix,
  indexedInputHandle,
  indexedInputHandleIndex,
  inputHandle,
  isIndexedInputHandle,
  isInputHandle,
  isNestedResultHandle,
  isUnknownResultOutputHandle,
  nestedResultHandle,
  nestedResultHandleIndex,
  RESULT_HANDLE_ID,
} from './graph/handles.js';

export type {
  IRArgRef,
  IRCommand,
  IRInput,
  IRPureValue,
  TransactionIR,
} from './ir/types.js';
export { createTransactionIR } from './ir/types.js';
export {
  isNonNegativeSafeInteger,
  isU16Index,
  MAX_RESULT_COUNT,
  RAW_ARGUMENT_INDEX_MAX,
} from './ir/limits.js';
export { pureTypeName } from './ir/pure.js';
export type { StructuralTransactionIR } from './ir/structural.js';
export {
  isStructuralTransactionIR,
  parseStructuralTransactionIR,
} from './ir/structural.js';

export type {
  Base64Bytes,
  JsonU64,
  ObjectDigest,
  ObjectId,
  RawArgument,
  RawCallArg,
  RawCommand,
  RawFundsWithdrawalArg,
  RawInputArgumentType,
  RawMoveCallArgumentTypes,
  RawObjectArg,
  RawOpenSignature,
  RawOpenSignatureBody,
  RawOpenSignatureReference,
  RawProgrammableMoveCall,
  RawProgrammableTransaction,
} from './raw/types.js';
export {
  isRawInputArgumentType,
  isRawMoveCallArgumentTypes,
  parseBase64Bytes,
  parseJsonU64,
  parseMoveIdentifier,
  parseMoveTypeTag,
  parseObjectDigest,
  parseObjectId,
} from './raw/types.js';
export { jsonStringifyWithBigInt, NULL_VALUE } from './utils.js';

export { graphToTransactionIR, transactionIRToGraph } from './graph/convert.js';
export {
  assertRawConvertibleIR,
  rawTransactionToIR,
  transactionIRToRaw,
  validateRawConvertibleIR,
} from './raw/convert.js';
export { transactionIRToMermaid } from './render/mermaid.js';
export type {
  MermaidDirection,
  TransactionIRToMermaidOptions,
} from './render/mermaid.js';
export {
  assertTsSdkRenderableIR,
  transactionIRToTsSdkCode,
  validateTsSdkRenderableIR,
} from './render/tsSdkCode.js';
export { validateTransactionIR } from './ir/validate.js';
export type { ValidateTransactionIROptions } from './ir/validate.js';
