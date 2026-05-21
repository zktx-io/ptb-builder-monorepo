export {
  errorDiagnostic,
  freezeDiagnostics,
  hasErrors,
  isGraphDiagnostic,
  PTBModelError,
} from './ir/diagnostics.js';
export type {
  DiagnosticBlocks,
  DiagnosticCategory,
  GraphDiagnostic,
  TransactionDiagnostic,
} from './ir/diagnostics.js';

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
  TypeArgumentNode,
  VariableNode,
} from './graph/types.js';
export { parseExecutableGraph } from './graph/executableGraph.js';
export { analyzePTBGraph } from './graph/types.js';
export type {
  AnalyzePTBGraphOptions,
  ExecutablePTBGraph,
  ParseExecutableGraphOptions,
  PTBGraphAnalysis,
} from './graph/types.js';
export { inferGraphInputTypes } from './graph/inputInference.js';
export type {
  GraphInputTypeInference,
  GraphInputTypeInferenceOptions,
  GraphInputTypeInferenceResult,
} from './graph/inputInference.js';
export type { GraphMoveCallEvidenceState } from './graph/moveCallEvidence.js';
export { materializeGraphInputValues } from './graph/inputMaterialization.js';
export type {
  GraphInputValueMaterialization,
  GraphInputValueMaterializationOptions,
  GraphInputValueMaterializationResult,
} from './graph/inputMaterialization.js';
export type { NumericWidth, PTBScalar, PTBType } from './ptbType.js';
export {
  isPTBType,
  parsePTBObjectTypeTagCandidate,
  ptbTypesEqual,
  serializePTBType,
  validatePTBType,
} from './ptbType.js';
export type {
  MoveCallSignatureEvidenceResolution,
  MoveFunctionSignatureEvidence,
  MoveModuleSignatureEvidence,
  MovePackageSignatureEvidence,
  ResolveMoveCallSignatureEvidenceOptions,
} from './move/evidence.js';
export {
  isMoveFunctionSignatureEvidence,
  isMoveModuleSignatureEvidence,
  isMovePackageSignatureEvidence,
  resolveMoveCallSignatureEvidence,
} from './move/evidence.js';
export {
  isTxContextOpenSignature,
  toPTBTypeFromConcreteTypeArgument,
  toPTBTypeFromOpenSignature,
} from './move/signature.js';
export type { IndexedHandleSuffix } from './graph/handles.js';
export {
  indexedHandleSuffix,
  indexedInputHandle,
  indexedInputHandleIndex,
  inputHandle,
  isIndexedInputHandle,
  isInputHandle,
  isNestedResultHandle,
  knownResultOutputHandles,
  nestedResultHandle,
  nestedResultHandleIndex,
  RESULT_HANDLE_ID,
} from './graph/handles.js';

export type {
  IRArgRef,
  IRCommand,
  IRInput,
  IRObjectSource,
  IRPureValue,
  TransactionIR,
} from './ir/types.js';
export {
  createTransactionIR,
  irObjectId,
  irResolvedObjectArg,
} from './ir/types.js';
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
  isRawOpenSignature,
  isRawOpenSignatureList,
  parseBase64Bytes,
  parseJsonU64,
  parseMoveIdentifier,
  parseMoveStructTypeTag,
  parseMoveTypeTag,
  parseObjectDigest,
  parseObjectId,
} from './raw/types.js';
export { jsonStringifyWithBigInt, NULL_VALUE } from './utils.js';

export { graphToTransactionIR, transactionIRToGraph } from './graph/convert.js';
export type {
  GraphToTransactionIROptions,
  TransactionIRToGraphOptions,
} from './graph/convert.js';
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
export type { TransactionIRToTsSdkCodeOptions } from './render/tsSdkCode.js';
export { validateTransactionIR } from './ir/validate.js';
export type { ValidateTransactionIROptions } from './ir/validate.js';
