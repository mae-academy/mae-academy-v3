export interface Diagnostic {
  line: number;
  message: string;
}

export interface SketchInstance {
  /** Generator that runs setup() once, then loop() forever, yielding scheduler requests. */
  main: () => Iterator<unknown, void, unknown>;
}
export interface CompiledSketch {
  js: string;
  instantiate: (rt: unknown, helpers: unknown) => SketchInstance;
}
export type CompileResult = { ok: true; sketch: CompiledSketch } | { ok: false; error: Diagnostic };

export interface PinUsage {
  /** Digital pins (0-13) read as inputs. */
  digitalInputs: number[];
  /** Subset of digitalInputs configured with INPUT_PULLUP. */
  pullups: number[];
  /** Analog channels (0-5) read via analogRead(). */
  analogInputs: number[];
  /** Digital pins (0-13) driven as outputs. */
  outputs: number[];
}
