import type { NodeSDKConfiguration } from '@opentelemetry/sdk-node'
import type { HttpContext } from '@adonisjs/core/http'
import type { DestinationMap } from './destinations.js'

export type {
  InstrumentationValue,
  CustomInstrumentationValue,
  HttpInstrumentationConfig,
  PinoInstrumentationConfig,
  InstrumentationsConfig,
} from './instrumentations.js'

export type { SpanOptions } from './decorators.js'

export { hiddenFields, type HiddenField, type OtelLoggingPresetOptions } from './logging.js'
export type {
  DestinationConfig,
  DestinationMap,
  DestinationSignal,
  DestinationSignals,
  OtlpDestinationConfig,
  OtlpDestinationOptions,
} from './destinations.js'

import type { InstrumentationsConfig } from './instrumentations.js'

/**
 * Configuration for @adonisjs/otel
 *
 * Extends NodeSDKConfiguration with simplified options and good defaults.
 * All options are optional - the package works out of the box.
 */
export interface OtelConfig extends Partial<
  Omit<NodeSDKConfiguration, 'resource' | 'instrumentations'>
> {
  /**
   * Enable or disable OpenTelemetry entirely.
   *
   * When disabled, no SDK is initialized and no traces are collected.
   * Useful for tests or local development without a collector.
   *
   * @default true (false in 'test' environment)
   */
  enabled?: boolean

  /**
   * Sampling ratio for traces (0.0 to 1.0).
   *
   * - `1.0` = 100% of traces are sampled (default)
   * - `0.1` = 10% of traces are sampled
   * - `0.0` = No traces are sampled
   *
   * This option is ignored if `sampler` is explicitly provided.
   *
   * @default 1.0
   */
  samplingRatio?: number

  /**
   * Enable debug mode to print spans to the console.
   *
   * When enabled, a `ConsoleSpanExporter` is automatically added
   * to help with local development and debugging.
   *
   * @default false
   */
  debug?: boolean

  /**
   * Service name for telemetry identification
   * @default process.env.OTEL_SERVICE_NAME || process.env.APP_NAME || 'unknown_service'
   */
  serviceName?: string

  /**
   * Service version
   * @default process.env.APP_VERSION || '0.0.0'
   */
  serviceVersion?: string

  /**
   * Deployment environment (production, staging, development, etc.)
   * @default process.env.APP_ENV || 'development'
   */
  environment?: string

  /**
   * Additional resource attributes to include in telemetry
   */
  resourceAttributes?: Record<string, string>

  /**
   * Instrumentations configuration.
   *
   * - Pass a config object to merge with defaults
   * - Pass an Instrumentation instance for custom instrumentations
   * - Pass `{ enabled: false }` to disable
   *
   * @example
   * ```ts
   * instrumentations: {
   *   '@opentelemetry/instrumentation-http': {
   *     ignoredUrls: ['/internal/*', '/custom-health'],
   *   },
   *   '@opentelemetry/instrumentation-pino': {
   *     logHook: (span, record) => {
   *       record.tenant_id = getTenantId()
   *     },
   *   },
   *   '@opentelemetry/instrumentation-pg': { enabled: false },
   * }
   * ```
   */
  instrumentations?: InstrumentationsConfig

  /**
   * Configure one or many OTLP destinations and fan-out telemetry to each one.
   *
   * Keys are destination identifiers (for example: `lgtm`, `secondary`).
   * Each destination can target all signals (`traces`, `metrics`, `logs`)
   * or only a subset.
   */
  destinations?: DestinationMap

  /**
   * Configure automatic user context extraction in the middleware.
   *
   * By default, extracts `id`, `email`, `role` from `ctx.auth.user`.
   * Set to `false` to disable entirely.
   *
   * @example
   * ```ts
   * userContext: {
   *   resolver: async (ctx) => ({
   *     id: ctx.auth.user.id,
   *     tenantId: ctx.auth.user.tenantId,
   *   }),
   * }
   * ```
   */
  userContext?: false | UserContextConfig
}

/**
 * Result returned by the user context resolver.
 * Supports custom attributes via index signature.
 */
export interface UserContextResult {
  id: string | number
  email?: string
  role?: string
  [key: string]: string | number | boolean | string[] | undefined
}

/**
 * Configuration for automatic user context extraction
 */
export interface UserContextConfig {
  /**
   * Enable/disable automatic user extraction from @adonisjs/auth
   * @default true
   */
  enabled?: boolean

  /**
   * Custom function to extract user context from the HttpContext.
   * When provided, replaces the default extraction logic.
   * Return `null` to skip setting user context for this request.
   */
  resolver?: (ctx: HttpContext) => UserContextResult | null | Promise<UserContextResult | null>
}

/**
 * User information for tracing
 */
export interface UserContext {
  id: string | number
  email?: string
  role?: string
}

/**
 * Headers carrier type for context propagation
 */
export type HeadersCarrier = Record<string, string | string[] | undefined>
