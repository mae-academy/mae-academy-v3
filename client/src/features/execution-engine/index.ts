/** Public execution-engine boundary. */
export { useExecutionEngine } from "./useExecutionEngine";
export type { UseExecutionEngineReturn } from "./useExecutionEngine";
export * as masmEngine from "./masmEngine";
export type { ExecutionRequest, ExecutionResponse } from "./executionWorker";
export type { ExecutionOptions, ExecutionResult, LanguageEngine, SupportedLanguage, TraceStep, TraceVariable } from "./types";
