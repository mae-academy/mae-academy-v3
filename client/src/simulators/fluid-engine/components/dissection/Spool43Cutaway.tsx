import React from 'react';
import type { SpoolAnalysis } from './cutawayPhysics';
import type { CutawayStageProps } from './cutawayParts';
import { SpoolValveCutaway } from './SpoolValveCutaway';

/** Hydraulic 4/3 spool valve (closed or float centre): opposed centring springs hold the lands in the middle until a pilot shifts the spool. */
export function Spool43Cutaway(props: CutawayStageProps & { analysis: SpoolAnalysis }) {
  return <SpoolValveCutaway {...props} idPrefix={props.analysis.kind} />;
}
