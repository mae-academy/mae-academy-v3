/** Follower counts shared by the telemetry API (fallback values) and the landing page (first paint). */
export const SOCIAL_FOLLOWER_BASELINE = { instagram: 58171, facebook: 59920 } as const;

export type SocialFollowerSource = 'live' | 'cache' | 'fallback';

export interface SocialFollowersPayload {
  readonly instagram: number;
  readonly facebook: number;
  /** ISO timestamp of the figures: when Meta was queried, or when the stored values were written. */
  readonly updatedAt: string;
  readonly source: SocialFollowerSource;
}
