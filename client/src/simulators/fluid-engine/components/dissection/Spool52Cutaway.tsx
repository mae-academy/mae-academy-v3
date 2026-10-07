import React from 'react';
import type { SpoolAnalysis } from './cutawayPhysics';
import type { CutawayStageProps } from './cutawayParts';
import { SpoolValveCutaway } from './SpoolValveCutaway';

/** 5/2 spool valve: rest (1→2, 4→5) and actuated (1→4, 2→3) positions, one pitch apart. */
export function Spool52Cutaway(props: CutawayStageProps & { analysis: SpoolAnalysis }) {
  return <SpoolValveCutaway {...props} idPrefix="spool52" />;
}
