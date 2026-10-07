import React from 'react';
import type { CheckAnalysis } from './cutawayPhysics';
import type { CutawayStageProps } from './cutawayParts';
import { CheckStage } from './CheckValveCutaway';

/**
 * Spring-loaded non-return valve: a calibrated spring in a guide sleeve at the downstream port holds the ball on its
 * conical seat until the upstream pressure exceeds the cracking pressure; the ball then compresses the spring.
 */
export function SpringCheckValveCutaway(props: CutawayStageProps & { analysis: CheckAnalysis }) {
  return <CheckStage {...props} idPrefix={props.idPrefix ?? 'springCheck'} spring />;
}
