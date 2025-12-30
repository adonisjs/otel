import type { Span } from '@opentelemetry/api'
import type { InstrumentationConfigMap } from '@opentelemetry/auto-instrumentations-node'
import type { Instrumentation } from '@opentelemetry/instrumentation'

/**
 * Value for a known instrumentation: config object, instance, or disabled
 */
export type InstrumentationValue<K extends keyof InstrumentationConfigMap> =
  | InstrumentationConfigMap[K]
  | Instrumentation
  | { enabled: false }

/**
 * Value for a custom instrumentation: instance or disabled
 */
export type CustomInstrumentationValue = Instrumentation | { enabled: false }

/**
 * Request info passed to the ignoreIncomingRequestHook
 */
export interface IgnoreRequestInfo {
  url?: string
  method?: string
}

/**
 * Extended config for @opentelemetry/instrumentation-http.
 * Adds AdonisJS-specific helpers for URL filtering.
 */
export interface HttpInstrumentationConfig extends Omit<
  NonNullable<InstrumentationConfigMap['@opentelemetry/instrumentation-http']>,
  'ignoreIncomingRequestHook'
> {
  /**
   * URLs to ignore in HTTP instrumentation.
   * Merged with defaults unless `mergeIgnoredUrls` is false.
   * Supports exact matches and prefix patterns ('/internal/*').
   *
   * @default ['/health', '/healthz', '/ready', '/metrics', ...]
   */
  ignoredUrls?: string[]

  /**
   * Whether to merge ignoredUrls with default ignored URLs or replace them entirely.
   * @default true
   */
  mergeIgnoredUrls?: boolean

  /**
   * Whether to automatically ignore static files (css, js, images, fonts, etc.).
   * @default true
   */
  ignoreStaticFiles?: boolean

  /**
   * Whether to automatically ignore OPTIONS requests (CORS preflight).
   * @default true
   */
  ignoreOptionsRequests?: boolean

  /**
   * Custom hook to ignore specific incoming requests.
   * Called AFTER the ignoredUrls, static files, and OPTIONS checks.
   */
  ignoreIncomingRequestHook?: (request: IgnoreRequestInfo) => boolean
}

/**
 * Extended config for @opentelemetry/instrumentation-pino.
 * Allows custom logHook while preserving the internal one.
 */
export interface PinoInstrumentationConfig extends Omit<
  NonNullable<InstrumentationConfigMap['@opentelemetry/instrumentation-pino']>,
  'logHook'
> {
  /**
   * Custom log hook executed AFTER the internal hook that adds route info.
   * Use this to add your own properties to log records.
   *
   * @example
   * ```ts
   * logHook: (span, record) => {
   *   record.tenant_id = getCurrentTenantId()
   * }
   * ```
   */
  logHook?: (span: Span, record: Record<string, unknown>) => void
}

/**
 * Keys of instrumentations with custom extended configs
 */
type ExtendedInstrumentationKeys =
  | '@opentelemetry/instrumentation-http'
  | '@opentelemetry/instrumentation-pino'

/**
 * All possible values for any instrumentation key
 */
type AnyInstrumentationValue =
  | HttpInstrumentationConfig
  | PinoInstrumentationConfig
  | InstrumentationConfigMap[keyof InstrumentationConfigMap]
  | CustomInstrumentationValue

/**
 * Instrumentations configuration map.
 *
 * - HTTP and Pino instrumentations have extended configs
 * - Known OpenTelemetry instrumentations have typed configs with autocomplete
 * - Custom instrumentations can be added with any string key
 */
export type InstrumentationsConfig = {
  '@opentelemetry/instrumentation-http'?:
    | HttpInstrumentationConfig
    | Instrumentation
    | { enabled: false }

  '@opentelemetry/instrumentation-pino'?:
    | PinoInstrumentationConfig
    | Instrumentation
    | { enabled: false }
} & {
  [K in Exclude<
    keyof InstrumentationConfigMap,
    ExtendedInstrumentationKeys
  >]?: InstrumentationValue<K>
} & {
  [key: string & {}]: AnyInstrumentationValue | undefined
}
