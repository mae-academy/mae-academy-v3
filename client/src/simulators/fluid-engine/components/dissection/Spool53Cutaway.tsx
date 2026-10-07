import React from 'react';
import type { SpoolAnalysis } from './cutawayPhysics';
import type { CutawayStageProps } from './cutawayParts';
import { SpoolValveCutaway } from './SpoolValveCutaway';

/** 5/3 closed-centre spool valve: two opposed centring springs hold the lands over the ports until a pilot shifts the spool. */
export function Spool53Cutaway(props: CutawayStageProps & { analysis: SpoolAnalysis }) {
  return <SpoolValveCutaway {...props} idPrefix="spool53" />;
}
