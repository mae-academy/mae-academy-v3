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

  const JSCPP: {
    run(code: string, input: string, config: JscppConfig & { debug: true }): JscppDebugger;
    run(code: string, input: string, config?: JscppConfig): number;
  };
  export default JSCPP;
}
