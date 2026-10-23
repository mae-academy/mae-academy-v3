/**
 * MAE Academy - Live Social Metrics Baseline Data & Configuration
 * 
 * Target Account: @mae.academy
 * Platforms: Instagram & Facebook
 * Realistic baseline estimates:
 * - Aggregate Views: 40M+ (Primary Hero Focus)
 * - Aggregate Community / Followers: 117k+
 * - High-engagement technical & engineering education reach
 */

export interface PlatformSocialData {
  platform: 'instagram' | 'facebook';
  handle: string;
  displayName: string;
  profileUrl: string;
  followers: number;
  videoViews: number;
  engagement: number; // Likes, comments, shares
  verified: boolean;
  avatarUrl?: string;
  accentColor: string;
  badgeGradient?: string;
}

export interface SocialMetricsSnapshot {
  instagram: PlatformSocialData;
  facebook: PlatformSocialData;
  lastUpdated: string; // ISO String or human readable timestamp
  estimatedVelocityPerMinute: number; // Organic views per minute baseline
}

export const INITIAL_SOCIAL_METRICS: SocialMetricsSnapshot = {
  instagram: {
    platform: 'instagram',
    handle: '@mae.academy',
    displayName: 'MAE Academy',
    profileUrl: 'https://www.instagram.com/mae.academy/',
    followers: 58240,
    videoViews: 18549000,
    engagement: 976000,
    verified: true,
    accentColor: '#E1306C',
    badgeGradient: 'linear-gradient(45deg, #F58529, #DD2A7B, #8134AF)',
  },
  facebook: {
    platform: 'facebook',
    handle: '@mae.academy',
    displayName: 'MAE Academy',
    profileUrl: 'https://web.facebook.com/search/top?q=mae%20academy',
    followers: 59000,
    videoViews: 21979000,
    engagement: 1089000,
    verified: true,
    accentColor: '#1877F2',
    badgeGradient: 'linear-gradient(135deg, #1877F2, #0C63D4)',
  },
  lastUpdated: '2026-10-23T12:00:00Z',
  estimatedVelocityPerMinute: 64, // Baseline ~64 organic views / min (drives the live counter in the hero)
};
