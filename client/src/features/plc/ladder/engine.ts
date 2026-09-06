/**
 * PLC Ladder backend contract.
 * This is the application-facing execution manager. It owns scan scheduling state,
 * but deliberately does not start browser timers or import any visual-editor code.
 */
import { compileLadder } from './compiler';
import { buildPlcState, clonePlcValue } from './model';
import { executeGeneratedCode } from './runtime';
import type { PlcAoi, PlcCompilationResult, PlcDiagnostic, PlcExecutionContext, PlcExecutionTrace, PlcRuntimeValue, PlcScanMode, PlcScanSnapshot, PlcTag, PlcVariableMap } from './types';

export interface PlcEngineConfig {
  scanTimeMs: number;
  maxScanTimeMs: number;
  enablePerformanceMetrics: boolean;
}

interface CachedCompilation { signature: string; result: PlcCompilationResult; }
interface InternalState {
  scanCount: number;
  isRunning: boolean;
  isPaused: boolean;
  nowUs: number;
  parameters: Record<string, PlcRuntimeValue>;
  localTags: Record<string, PlcRuntimeValue>;
  diagnostics: PlcDiagnostic[];
  trace?: PlcExecutionTrace;
}

const DEFAULT_CONFIG: PlcEngineConfig = { scanTimeMs: 100, maxScanTimeMs: 1000, enablePerformanceMetrics: true };

function cloneRecord(record: Record<string, PlcRuntimeValue>): Record<string, PlcRuntimeValue> { return Object.fromEntries(Object.entries(record).map(([name, value]) => [name, clonePlcValue(value)])); }
function sourceHash(source: string): string { let hash = 2166136261; for (let index = 0; index < source.length; index += 1) { hash ^= source.charCodeAt(index); hash = Math.imul(hash, 16777619); } return (hash >>> 0).toString(16); }
function tagTypeMap(tags: PlcTag[]): ReadonlyMap<string, PlcTag['dataType']> { return new Map(tags.map(tag => [tag.name, tag.dataType])); }
function cacheSignature(source: string, tags: PlcTag[], trace: boolean): string { return `${source}:${JSON.stringify(tags.map(tag => ({ name: tag.name, dataType: tag.dataType, usage: tag.usage, dimension: tag.dimension })))}:${trace ? 'trace' : 'normal'}`; }

export class PlcLadderEngine {
  private readonly cache = new Map<string, CachedCompilation>();
  private generation = 0;
  private pipeline: Promise<void> = Promise.resolve();
  private state: InternalState;
  readonly config: PlcEngineConfig;

  constructor(readonly aoi: PlcAoi, config: Partial<PlcEngineConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    const initial = buildPlcState(aoi);
    this.state = { scanCount: 0, isRunning: false, isPaused: false, nowUs: 0, parameters: initial.parameters, localTags: initial.localTags, diagnostics: [] };
  }

  get snapshot(): PlcScanSnapshot {
    return { scanCount: this.state.scanCount, nowUs: this.state.nowUs, parameters: cloneRecord(this.state.parameters), localTags: cloneRecord(this.state.localTags), diagnostics: [...this.state.diagnostics], ...(this.state.trace ? { trace: structuredClone(this.state.trace) } : {}) };
  }

  get isRunning(): boolean { return this.state.isRunning; }
  get isPaused(): boolean { return this.state.isPaused; }
  get scanPeriodUs(): number { return Math.max(1, Math.round(Math.max(0, this.config.scanTimeMs) * 1000)); }

  compileRoutine(name = 'Logic', trace = true): PlcCompilationResult {
    const routine = this.aoi.routines[name];
    if (!routine || routine.type !== 'ld') return { success: false, ast: { type: 'LDProgram', rungs: [] }, diagnostics: [{ severity: 'error', code: 'LD-COMP-001', message: `Routine ${name} is unavailable or is not Ladder Diagram.` }] };
    const key = `${this.aoi.name}:${name}`;
    const signature = cacheSignature(routine.content, this.aoi.tags, trace);
    const cached = this.cache.get(key);
    if (cached?.signature === signature) return cached.result;
    const result = compileLadder(routine.content, this.aoi);
    this.cache.set(key, { signature, result });
    return result;
  }

  clearCache() { this.cache.clear(); }
  invalidateCache() { this.cache.clear(); }

  start(): PlcScanSnapshot {
    const initial = buildPlcState(this.aoi);
    this.state = { scanCount: 0, isRunning: true, isPaused: false, nowUs: 0, parameters: initial.parameters, localTags: initial.localTags, diagnostics: [] };
    this.executeRoutine('Logic', 'prescan', false);
    if (this.state.isRunning && this.aoi.routines.Prescan) this.executeRoutine('Prescan', 'normal', false);
    return this.snapshot;
  }

  stop() { this.generation += 1; this.state.isRunning = false; this.state.isPaused = false; }
  pause() { if (this.state.isRunning) this.state.isPaused = true; }
  resume() { if (this.state.isRunning) this.state.isPaused = false; }

  setTag(name: string, value: PlcRuntimeValue, usage?: PlcTag['usage']) {
    const tag = this.aoi.tags.find(candidate => candidate.name === name);
    const target = usage === 'local' || tag?.usage === 'local' ? this.state.localTags : this.state.parameters;
    target[name] = clonePlcValue(value);
  }

  manualStep(): PlcScanSnapshot {
    if (!this.state.isRunning || !this.state.isPaused) return this.snapshot;
    this.state.nowUs += this.scanPeriodUs;
    this.executeRoutine('Logic', 'normal', true);
    return this.snapshot;
  }

  scheduledAdvanceTo(targetUs: number): PlcScanSnapshot {
    if (!this.state.isRunning || this.state.isPaused) return this.snapshot;
    const bounded = Math.max(this.state.nowUs, Math.trunc(targetUs));
    const scans = Math.floor((bounded - this.state.nowUs) / this.scanPeriodUs);
    for (let index = 0; index < scans && this.state.isRunning; index += 1) {
      this.state.nowUs += this.scanPeriodUs;
      this.executeRoutine('Logic', 'normal', true);
    }
    return this.snapshot;
  }

  enqueueManualStep(): Promise<PlcScanSnapshot> {
    const generation = this.generation;
    let result = this.snapshot;
    this.pipeline = this.pipeline.then(() => { if (generation === this.generation) result = this.manualStep(); }).catch(() => undefined);
    return this.pipeline.then(() => result);
  }

  private executeRoutine(name: string, scanMode: PlcScanMode, tracing: boolean) {
    const compilation = this.compileRoutine(name, tracing);
    if (!compilation.success || !compilation.code) { this.fail(compilation.diagnostics); return; }
    const variables: PlcVariableMap = new Map([
      ...Object.entries(cloneRecord(this.state.parameters)),
      ...Object.entries(cloneRecord(this.state.localTags)),
    ]);
    const trace = tracing ? { sourceHash: sourceHash(this.aoi.routines[name].content), rungs: [] } : null;
    const context: PlcExecutionContext = { variables, logs: [], nowUs: this.state.nowUs, scanMode, trace };
    executeGeneratedCode(compilation.code, context, tagTypeMap(this.aoi.tags));
    this.readBack(context.variables);
    this.state.diagnostics = [...context.logs];
    if (context.logs.some(log => log.severity === 'error')) { this.fail(context.logs); return; }
    if (trace) this.state.trace = trace;
    if (scanMode === 'normal' && name === 'Logic') this.state.scanCount += 1;
  }

  private readBack(variables: PlcVariableMap) {
    const parameters = cloneRecord(this.state.parameters); const localTags = cloneRecord(this.state.localTags);
    for (const tag of this.aoi.tags) {
      if (!variables.has(tag.name)) continue;
      const value = clonePlcValue(variables.get(tag.name)!);
      if (tag.usage === 'local') localTags[tag.name] = value; else parameters[tag.name] = value;
    }
    this.state.parameters = parameters; this.state.localTags = localTags;
  }

  private fail(diagnostics: PlcDiagnostic[]) { this.state.diagnostics = [...diagnostics]; this.stop(); }
}
