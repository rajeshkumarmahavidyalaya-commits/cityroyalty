import type { Config } from '../config';
import { logger } from '../logger';

/** Ask the storefront to drop cached data after a catalogue/content change. Best effort. */
export function createRevalidator(config: Config) {
  return async function revalidate(...tags: string[]) {
    if (!config.REVALIDATE_URL || !config.REVALIDATE_SECRET) return;
    try {
      await fetch(config.REVALIDATE_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-revalidate-secret': config.REVALIDATE_SECRET },
        body: JSON.stringify({ tags }),
        signal: AbortSignal.timeout(4000),
      });
    } catch (err) {
      logger.warn({ err: String(err) }, 'storefront revalidation failed');
    }
  };
}
export type Revalidate = ReturnType<typeof createRevalidator>;
