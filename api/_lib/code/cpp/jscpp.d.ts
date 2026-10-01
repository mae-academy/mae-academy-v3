/** JSCPP ships no type definitions and no @types package exists; this covers the surface we use. */
declare module "JSCPP" {
  export interface JscppAstNode {
    type: string | null;
    sLine: number;
    sColumn: number;
    sOffset: number;
    eLine: number;
    eColumn: number;
    eOffset: number;
  }

  export interface JscppScope {
    $name: string;
    variables: Record<string, unknown>;
  }

  export interface JscppRuntime {
    scope: JscppScope[];
    readVar(name: string): { t: unknown; v: unknown };
    makeTypeString(t: unknown): string;
    makeValueString(v: unknown): string;
  }

  export interface JscppNamedVariable {
    name: string;
    /** Absent for function bindings (e.g. the entry for a declared `add(...)`), not just plain variables. */
    type?: string;
    value?: string;
  }

  export interface JscppDebugger {
    readonly done: boolean;
    readonly rt: JscppRuntime;
    next(): false | { t: unknown; v: number };
    continue(): false | { t: unknown; v: number };
    nextNode(): JscppAstNode | null;
    nextLine(): string;
    getSource(): string;
    variable(): JscppNamedVariable[];
    variable(name: string): { type: string; value: unknown };
    setStopConditions(conditions: Record<string, boolean>): void;
    setCondition(name: string, callback: (prev: JscppAstNode | null, next: JscppAstNode) => boolean): void;
    enableCondition(name: string): void;
    disableCondition(name: string): void;
  }

  export interface JscppConfig {
    stdio?: {
      write?: (text: string) => void;
      drain?: () => string | null;
    };
    unsigned_overflow?: "error" | "warn" | "ignore";
    maxTimeout?: number;
  }

  /** Opaque type token (e.g. `rt.intTypeLiteral`), and value wrapper JSCPP passes to every operator/method. */
  export interface JscppType {
    readonly type: string;
    readonly name?: string;
  }
  export interface JscppValue<V = unknown> {
    t: JscppType;
    v: V;
    left: boolean;
  }
  export interface JscppClassMember {
    name: string;
    type: JscppType;
    initialize?: (rt: JscppCRuntime, _this: JscppValue) => JscppValue;
  }
  /** The subset of JSCPP's internal `CRuntime` needed to write an `includes/*` STL shim. */
  export interface JscppCRuntime {
    readonly intTypeLiteral: JscppType;
    readonly unsignedintTypeLiteral: JscppType;
    readonly doubleTypeLiteral: JscppType;
    readonly boolTypeLiteral: JscppType;
    readonly charTypeLiteral: JscppType;
    readonly voidTypeLiteral: JscppType;
    val<V>(t: JscppType, v: V, left?: boolean, isInitializing?: boolean): JscppValue<V>;
    clone<V>(v: JscppValue<V>, isInitializing?: boolean): JscppValue<V>;
    newClass(classname: string, members: JscppClassMember[]): JscppType;
    getTypeSignature(t: JscppType): string;
    regFunc(
      f: (rt: JscppCRuntime, _this: JscppValue, ...args: JscppValue[]) => JscppValue | void,
      lt: JscppType | "global",
      name: string,
      args: JscppType[],
      retType: JscppType
    ): JscppType;
    regOperator(
      f: (rt: JscppCRuntime, _this: JscppValue, ...args: JscppValue[]) => JscppValue,
      lt: JscppType,
      name: string,
      args: JscppType[],
      retType: JscppType
    ): JscppType;
    raiseException(message: string): never;
    castable(type1: JscppType, type2: JscppType): boolean;
    normalPointerType(target: JscppType): JscppType;
    arrayPointerType(elementType: JscppType, size: number): JscppType;
    isStringType(t: JscppType): boolean;
    getStringFromCharArray(element: JscppValue): string;
    makeCharArrayFromString(str: string, typename?: string): JscppValue<{ target: JscppValue<number>[]; position: number }>;
    /** Keyed by `getTypeSignature`; only the slice this shim touches (`father`/`cConstructor`/`handlers`) is declared. */
    types: Record<
      string,
      {
        father?: string;
        cConstructor?: (rt: JscppCRuntime, _this: JscppValue) => void;
        handlers?: Record<string, { default: (rt: JscppCRuntime, _this: JscppValue, ...args: JscppValue[]) => JscppValue }>;
      }
    >;
  }
  export interface JscppInclude {
    load(rt: JscppCRuntime): void;
  }

  const JSCPP: {
    run(code: string, input: string, config: JscppConfig & { debug: true }): JscppDebugger;
    run(code: string, input: string, config?: JscppConfig): number;
    includes: Record<string, JscppInclude>;
  };
  export default JSCPP;
}
