import { beforeAll } from 'vitest';

/**
 * Components read their copy from the i18n dictionaries, so any test that renders one needs the English resources loaded,
 * exactly as the app does at start-up. Node-only tests (no DOM) never render components and skip it.
 */
beforeAll(async () => {
  if (typeof document !== 'undefined') await import('@/i18n/config');
});
