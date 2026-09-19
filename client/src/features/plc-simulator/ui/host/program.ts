import { validateNetworkLayout, type CounterNode, type LadderProgram, type Network, type NetworkId, type NodeId, type Operand, type TimerNode } from '../../domain/ast';
import type { HardwareProfile } from '../../domain/hardware';
import type { MemoryMap } from '../../domain/memory';
import { compileProgram } from '../../engine/compiler';
import type { LcdParam } from '../hardware/lcd-fsm';

export const toProgram = (networks: readonly Network[], profile: HardwareProfile): LadderProgram => ({
  schemaVersion: 1,
  profileId: profile.id,
  networks,
});

export interface ProfileIssue {
  readonly severity: 'error' | 'warning';
  readonly message: string;
  readonly networkId?: NetworkId;
  readonly nodeId?: NodeId;
}

/**
 * Checks a program against a hardware profile: everything the engine compiler enforces (address
 * prefixes, bounds, access widths, instance pools), plus the grid and element limits the editor
 * applies. Used when the profile is switched, so an incompatible program is reported rather than
 * silently accepted.
 */
export function validateForProfile(networks: readonly Network[], profile: HardwareProfile): ProfileIssue[] {
  const issues: ProfileIssue[] = [];

  for (const diagnostic of compileProgram(toProgram(networks, profile), profile).diagnostics) {
    issues.push({
      severity: diagnostic.severity,
      message: diagnostic.message,
      ...(diagnostic.networkId === undefined ? {} : { networkId: diagnostic.networkId }),
      ...(diagnostic.nodeId === undefined ? {} : { nodeId: diagnostic.nodeId }),
    });
  }

  const { limits } = profile;
  for (const network of networks) {
    for (const layout of validateNetworkLayout(network)) {
      issues.push({ severity: 'error', message: layout.message, networkId: network.id, ...(layout.nodeId === undefined ? {} : { nodeId: layout.nodeId }) });
    }
    if (network.grid.rows > limits.maxGridRows || network.grid.cols > limits.maxGridCols) {
      issues.push({
        severity: 'error',
        networkId: network.id,
        message: `Network ${network.id} is ${network.grid.rows}x${network.grid.cols}; ${profile.model} allows ${limits.maxGridRows}x${limits.maxGridCols}`,
      });
    }
    if (network.nodes.length > limits.maxNodesPerNetwork) {
      issues.push({
        severity: 'error',
        networkId: network.id,
        message: `Network ${network.id} has ${network.nodes.length} elements; ${profile.model} allows ${limits.maxNodesPerNetwork}`,
      });
    }
  }
  return issues;
}

// ---- timers and counters as the LCD sees them ----------------------------------------------------

export interface ParamSource {
  readonly networkId: NetworkId;
  readonly node: TimerNode | CounterNode;
  /** Slot that holds the preset, which is also the LCD label. */
  readonly slot: 'PT' | 'PV';
  readonly operand: Operand;
}

/** Every timer and counter of the program, in execution order. */
export function collectParams(networks: readonly Network[]): ParamSource[] {
  const found: ParamSource[] = [];
  for (const network of networks) {
    for (const node of network.nodes) {
      if (node.type === 'timer') found.push({ networkId: network.id, node, slot: 'PT', operand: node.inputs.PT });
      else if (node.type === 'counter') found.push({ networkId: network.id, node, slot: 'PV', operand: node.inputs.PV });
    }
  }
  return found;
}

/** Effective preset: a constant is read from the program, an address from live memory. */
export function presetOf(source: ParamSource, memory: MemoryMap): number {
  if (source.operand.kind === 'constant') return source.operand.value;
  try {
    return memory.readSigned(source.operand.address);
  } catch {
    return 0;
  }
}

export function toLcdParam(source: ParamSource, memory: MemoryMap): LcdParam {
  const { node } = source;
  let current = 0;
  try {
    current = memory.readSigned(node.instance);
  } catch {
    // instance not allocated on this profile: shows as 0 and the compiler already flags it
  }
  return {
    kind: node.type,
    instance: node.instance,
    title: node.type === 'timer' ? `${node.instance} ${node.timeBaseMs}ms` : `${node.instance} ${node.fn}`,
    label: source.slot,
    current,
    preset: presetOf(source, memory),
  };
}
