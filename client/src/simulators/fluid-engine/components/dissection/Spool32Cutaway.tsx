import React from 'react';
import type { SpoolAnalysis } from './cutawayPhysics';
import type { CutawayStageProps } from './cutawayParts';
import { SpoolValveCutaway } from './SpoolValveCutaway';

/** 3/2 spool valve: two lands, rest and actuated positions one pitch apart. */
export function Spool32Cutaway(props: CutawayStageProps & { analysis: SpoolAnalysis }) {
  return <SpoolValveCutaway {...props} idPrefix="spool32" />;
}
