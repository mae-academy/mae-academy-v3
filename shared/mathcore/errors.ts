/**
 * Error catalog of the Math Core engine. Every user-facing message the engine builds has a key here and its params;
 * the page shows `t("errors." + key, params)` in the reader's language (client i18n: en, ar, es). The English `message`
 * kept next to each key is what tests and logs read. Keys with no translation fail the catalog test.
 */
export const ERROR_KEYS = [
  // parse and normalize (the expression's shape)
  "tooLong", "invalidExpression", "nodeLimit", "unrecognized", "unexpectedText", "complexNumbers", "unsupportedForm",
  "unsupportedOperation", "arity", "emptyParens", "wrongArgCount", "emptyExpression", "powerArity", "primeNeedsName",
  "derivativeNeedsVariable", "derivativeVariableName", "matrixRowsMissing", "matrixRowNotList", "integralLimits", "needsIndexLimits",
  // compile
  "undefinedSymbol", "needsArguments", "notNumeric", "wrongArity", "comparisonSides", "derivativeVariableUndefined", "indexName",
  "integrationVariableName", "functionName", "undefinedFunction", "userFunctionArity", "recursionDepth",
  // graph engine (items, definitions, systems)
  "entryNotFinite", "matrixError", "notMatrix", "unknownCountMismatch", "equationUndefinedAtZero", "equationNotLinear",
  "circularDefinition", "definedTwice", "dependsOnCycle", "tooManyParams", "notParsed",
  // inference (what a line can be drawn as)
  "inferenceFailed", "needsEquation", "malformedFunction", "functionParamNames", "selfDerivative", "firstOrderOnly",
  "derivativeOnLeft", "surfaceNeeds3D", "chainedComparison", "points3D", "pairsOnly", "pairVariables", "complexMapDeferred",
  "yNeedsEquation", "zEquation", "equationNeedsXY", "malformedMatrix", "malformedRow", "matrixSizeV1", "unknownsColumn",
  "rightSideColumn", "systemSizeV1", "rightSideEntries", "unknownNames", "unknownOnce", "rightSideUnknowns", "needsMatrixA",
  "matrixAsize", "matrixUnknowns", "systemShape", "strayUnknown",
  // linear algebra
  "qrNoConvergence",
] as const;

export type ErrorKey = (typeof ERROR_KEYS)[number];
export type ErrorParams = Record<string, string | number>;

/** An error carrying its catalog key and params; `message` is the English text (tests and logs). */
export class KeyedError extends Error {
  readonly key: ErrorKey;
  readonly params: ErrorParams;
  constructor(message: string, key: ErrorKey, params: ErrorParams = {}) {
    super(message);
    this.name = "KeyedError";
    this.key = key;
    this.params = params;
  }
}
