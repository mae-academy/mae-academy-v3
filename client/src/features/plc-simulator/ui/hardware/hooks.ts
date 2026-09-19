import { useSyncExternalStore } from 'react';
import type { MemoryMap } from '../../domain/memory';
import type { FrameStore } from './frame-store';
import type { VirtualField } from './virtual-field';

/** Live value of one memory bit; each LED subscribes on its own and re-renders only when it flips. */
export function useMemoryBitOf(memory: MemoryMap, address: string): boolean {
  return useSyncExternalStore(
    (listener) => memory.subscribe(() => listener()),
    () => {
      try {
        return memory.readBit(address);
      } catch {
        return false;
      }
    },
    () => false,
  );
}

/** Position of one simulated field input. */
export function useFieldInput(field: VirtualField, index: number): boolean {
  return useSyncExternalStore(field.subscribe, () => field.getInput(index), () => false);
}

/** Frame counter for readouts that should refresh at display rate rather than scan rate. */
export function useFrameVersion(frame: FrameStore): number {
  return useSyncExternalStore(frame.subscribe, frame.getVersion, () => 0);
}
