export type LogicState = 0 | 1 | 'Z' | 'X';

/** One component's carried state: pin levels, staged outputs, edge memory and component-specific storage. */
export type ComponentWireState = { i: [string, LogicState][]; o: [string, LogicState][]; n: [string, LogicState][]; lc: LogicState; x: unknown };

/**
 * Complete discrete-event state. The engine is stateless: the browser sends back exactly what the previous
 * response carried.
 *   t: simulated ns, seq: next event id, d: delta cycle, ev: queued events [id, atNs, delta, target, 1 = commit],
 *   clk: next clock edge per clock component, inputs: digital-input levels, comps: per-component state
 */
export interface DesWireState {
  t: number; seq: number; d: number; osc: boolean; bud: boolean;
  ev: [number, number, number, string, 0 | 1][];
  clk: [string, number][];
  inputs: Record<string, LogicState>;
  comps: Record<string, ComponentWireState>;
}
