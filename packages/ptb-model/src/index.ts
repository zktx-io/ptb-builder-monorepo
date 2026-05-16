export {
  assertNoErrors,
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
  NumericWidth,
  Port,
  PortDirection,
  PortRole,
  PTBEdge,
  PTBGraph,
  PTBNode,
  PTBScalar,
  PTBType,
  StartNode,
  VariableNode,
} from './graph/types.js';
export {
  isPTBGraph,
  isPTBType,
  validatePTBGraph,
  validatePTBType,
} from './graph/types.js';

export type {
  IRArgRef,
  IRCommand,
  IRInput,
  IRPureValue,
  TransactionIR,
} from './ir/types.js';
export { createTransactionIR } from './ir/types.js';

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
  parseObjectId,
} from './raw/types.js';
export { jsonStringifyWithBigInt, NULL_VALUE } from './utils.js';

export { graphToTransactionIR, transactionIRToGraph } from './graph/convert.js';
export { rawTransactionToIR, transactionIRToRaw } from './raw/convert.js';
export { transactionIRToMermaid } from './render/mermaid.js';
export type {
  MermaidDirection,
  TransactionIRToMermaidOptions,
} from './render/mermaid.js';
export { transactionIRToTsSdkCode } from './render/tsSdkCode.js';
export { validateTransactionIR } from './ir/validate.js';
export type { ValidateTransactionIROptions } from './ir/validate.js';
