import { useEffect, useMemo, useState } from 'react';
import type { EngineSnapshot } from '@shared/fluid/engine/types';
import { sensorId } from '@shared/fluid/engine/FluidEngine';
import { emptyTracker, trackSample, type CycleTracker, type CylinderReading } from '../models/functionDiagram';
import type { SimulationStatus } from './useFluidEngineBridge';

/**
 * Telemetry for the displacement-step diagram: feeds every published snapshot of a running (or paused) simulation, with the
 * state of each cylinder's position switches, to the sequence tracker, and starts over on reset or when the set of cylinders changes.
 */
export function useFunctionDiagram(snapshot: EngineSnapshot, status: SimulationStatus, cylinderIds: string[]): CycleTracker {
  const [tracker, setTracker] = useState<CycleTracker>(emptyTracker);
  const key = useMemo(() => cylinderIds.join('|'), [cylinderIds]);
  useEffect(() => { setTracker(emptyTracker()); }, [key]);
  useEffect(() => {
    if (status === 'IDLE') { setTracker(previous => (previous.time === 0 && Object.keys(previous.motion).length === 0 ? previous : emptyTracker())); return; }
    const readings: Record<string, CylinderReading> = {};
    for (const id of key ? key.split('|') : []) {
      const retracted = Boolean(snapshot.sensors[sensorId(id, 'S1')]);
      const extended = Boolean(snapshot.sensors[sensorId(id, 'S2')]);
      readings[id] = { position: snapshot.cylinders[id]?.stroke ?? 0, end: retracted ? 0 : extended ? 1 : null };
    }
    setTracker(previous => trackSample(previous, snapshot.time, readings));
  }, [snapshot, status, key]);
  return tracker;
}
