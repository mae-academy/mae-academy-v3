import React from 'react';
import type { SpoolAnalysis } from './cutawayPhysics';
import type { CutawayStageProps } from './cutawayParts';
import { SpoolValveCutaway } from './SpoolValveCutaway';

/** 4/2 spool valve: two lands, rest and actuated positions one pitch apart. */
export function Spool42Cutaway(props: CutawayStageProps & { analysis: SpoolAnalysis }) {
  return <SpoolValveCutaway {...props} idPrefix="spool42" />;
}
