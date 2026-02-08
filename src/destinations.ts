import type { OtlpDestinationConfig, OtlpDestinationOptions } from './types/destinations.js'

/**
 * Create an OTLP destination config with sensible defaults.
 *
 * Defaults:
 * - `enabled: true`
 * - `signals: 'all'`
 */
export function otlp(options: OtlpDestinationOptions): OtlpDestinationConfig {
  return {
    type: 'otlp',
    ...options,
    enabled: options.enabled ?? true,
    signals: options.signals ?? 'all',
  }
}

/**
 * Helper namespace for destination factories.
 *
 * @example
 * ```ts
 * destinations: {
 *   lgtm: destinations.otlp({ endpoint: 'http://localhost:4318', signals: 'all' }),
 * }
 * ```
 */
export const destinations = {
  otlp,
}
