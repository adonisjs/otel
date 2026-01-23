import {
  getNodeAutoInstrumentations,
  InstrumentationConfigMap,
} from '@opentelemetry/auto-instrumentations-node'
import type { Instrumentation } from '@opentelemetry/instrumentation'
import { resourceFromAttributes } from '@opentelemetry/resources'
import { NodeSDK } from '@opentelemetry/sdk-node'
import {
  ConsoleSpanExporter,
  ParentBasedSampler,
  SimpleSpanProcessor,
  TraceIdRatioBasedSampler,
} from '@opentelemetry/sdk-trace-base'
import {
  ATTR_HTTP_ROUTE,
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
} from '@opentelemetry/semantic-conventions'
import {
  ATTR_DEPLOYMENT_ENVIRONMENT_NAME,
  ATTR_SERVICE_INSTANCE_ID,
} from '@opentelemetry/semantic-conventions/incubating'

import type { OtelConfig } from './types/index.js'
import type {
  HttpInstrumentationConfig,
  PinoInstrumentationConfig,
} from './types/instrumentations.js'
import { HttpContext } from '@adonisjs/core/http'
import { HttpUrlFilter } from './http_url_filter.js'
import debug from './debug.js'

/**
 * OpenTelemetry SDK manager for AdonisJS.
 *
 * Provides sensible defaults and easy configuration for OpenTelemetry
 * while allowing full customization when needed.
 *
 * @example
 * ```ts
 * import { OtelManager } from '@adonisjs/otel'
 * import config from '#config/otel'
 *
 * const manager = OtelManager.create(config)
 * manager?.start()
 *
 * // Later, on shutdown
 * await manager?.shutdown()
 * ```
 */
export class OtelManager {
  static #instance: OtelManager | null = null
  readonly sdk: NodeSDK
  readonly serviceName: string
  readonly serviceVersion: string
  readonly environment: string

  #config: OtelConfig

  constructor(config: OtelConfig) {
    this.#config = config
    this.serviceName = this.#resolveServiceName()
    this.serviceVersion = this.#resolveServiceVersion()
    this.environment = this.#resolveEnvironment()

    this.sdk = this.#createSdk()
  }

  /**
   * Resolve the service name from config or environment
   */
  #resolveServiceName(): string {
    return (
      this.#config.serviceName ||
      process.env.OTEL_SERVICE_NAME ||
      process.env.APP_NAME ||
      'unknown_service'
    )
  }

  /**
   * Resolve the service version from config or environment
   */
  #resolveServiceVersion(): string {
    return this.#config.serviceVersion || process.env.APP_VERSION || '0.0.0'
  }

  /**
   * Resolve the environment from config or environment
   */
  #resolveEnvironment(): string {
    return this.#config.environment || process.env.APP_ENV || 'development'
  }

  /**
   * Build the OpenTelemetry Resource with service metadata
   */
  #buildResource() {
    return resourceFromAttributes({
      [ATTR_SERVICE_NAME]: this.serviceName,
      [ATTR_SERVICE_VERSION]: this.serviceVersion,
      [ATTR_DEPLOYMENT_ENVIRONMENT_NAME]: this.environment,
      [ATTR_SERVICE_INSTANCE_ID]: process.env.HOSTNAME || crypto.randomUUID(),
      ...this.#config.resourceAttributes,
    })
  }

  /**
   * Check if a value is an Instrumentation instance
   */
  #isInstrumentationInstance(value: unknown): value is Instrumentation {
    return (
      typeof value === 'object' &&
      value !== null &&
      'instrumentationName' in value &&
      typeof (value as Instrumentation).instrumentationName === 'string'
    )
  }

  /**
   * Check if a value is a "disabled" config
   */
  #isDisabledConfig(value: unknown): value is { enabled: false } {
    return (
      typeof value === 'object' &&
      value !== null &&
      'enabled' in value &&
      (value as { enabled: boolean }).enabled === false
    )
  }

  /**
   * Process user instrumentation configuration
   */
  #processUserInstrumentations(userConfig: OtelConfig['instrumentations']) {
    const customInstances: Instrumentation[] = this.#config.customInstrumentations ?? []
    const disabledSet = new Set<string>()
    const configOverrides: Partial<InstrumentationConfigMap> = {}
    let httpConfig: HttpInstrumentationConfig | undefined
    let pinoConfig: PinoInstrumentationConfig | undefined

    if (!userConfig)
      return { customInstances, disabledSet, configOverrides, httpConfig, pinoConfig }

    for (const [name, value] of Object.entries(userConfig)) {
      if (this.#isDisabledConfig(value)) {
        disabledSet.add(name)
        continue
      }

      if (this.#isInstrumentationInstance(value)) {
        customInstances.push(value)
        disabledSet.add(name)
        continue
      }

      if (name === '@opentelemetry/instrumentation-http') {
        httpConfig = value as HttpInstrumentationConfig
        continue
      }

      if (name === '@opentelemetry/instrumentation-pino') {
        pinoConfig = value as PinoInstrumentationConfig
        continue
      }

      configOverrides[name as keyof InstrumentationConfigMap] = value as any
    }

    return { customInstances, disabledSet, configOverrides, httpConfig, pinoConfig }
  }

  /**
   * Build the base instrumentation configuration
   */
  #buildBaseInstrumentationConfig() {
    return {
      '@opentelemetry/instrumentation-net': { enabled: false },
      '@opentelemetry/instrumentation-dns': { enabled: false },
      '@opentelemetry/instrumentation-socket.io': { enabled: false },
      '@opentelemetry/instrumentation-pg': { enabled: false },
      '@opentelemetry/instrumentation-mysql': { enabled: false },
      '@opentelemetry/instrumentation-mysql2': { enabled: false },
    } as InstrumentationConfigMap
  }

  /**
   * Build instrumentations from user config merged with defaults
   */
  #buildInstrumentations(): Instrumentation[] {
    const { customInstances, disabledSet, configOverrides, httpConfig, pinoConfig } =
      this.#processUserInstrumentations(this.#config.instrumentations)

    if (disabledSet.size > 0) debug('disabled instrumentations: %O', [...disabledSet])
    if (customInstances.length > 0)
      debug(
        'custom instrumentations: %O',
        customInstances.map((i) => i.instrumentationName)
      )

    const mergedConfig = this.#buildBaseInstrumentationConfig()

    for (const [name, config] of Object.entries(configOverrides)) {
      mergedConfig[name as keyof InstrumentationConfigMap] = {
        ...mergedConfig[name as keyof InstrumentationConfigMap],
        ...config,
      } as any
    }

    for (const name of disabledSet) {
      mergedConfig[name as keyof InstrumentationConfigMap] = { enabled: false } as any
    }

    const httpUrlFilter = new HttpUrlFilter(httpConfig)
    httpUrlFilter.applyToConfig(mergedConfig, httpConfig)
    this.#applyPinoInstrumentationConfig(mergedConfig, pinoConfig)

    const autoInstrumentations = getNodeAutoInstrumentations(mergedConfig)

    return [...autoInstrumentations, ...customInstances]
  }

  /**
   * Apply Pino instrumentation configuration with smart merging of logHook
   */
  #applyPinoInstrumentationConfig(
    mergedConfig: InstrumentationConfigMap,
    userPinoConfig: PinoInstrumentationConfig | undefined
  ): void {
    const pinoKey = '@opentelemetry/instrumentation-pino' as const
    const currentConfig = mergedConfig[pinoKey]

    if (currentConfig && 'enabled' in currentConfig && currentConfig.enabled === false) {
      return
    }

    const userLogHook = userPinoConfig?.logHook
    mergedConfig[pinoKey] = {
      ...currentConfig,
      ...userPinoConfig,
      logHook: (span, record) => {
        const httpContext = HttpContext.get()
        const routePattern = httpContext?.route?.pattern
        if (routePattern) span.setAttribute(ATTR_HTTP_ROUTE, routePattern)

        if (userLogHook) userLogHook(span, record as Record<string, unknown>)
      },
    }
  }

  /**
   * Build sampler from samplingRatio if no explicit sampler is provided
   */
  #buildSampler() {
    if (this.#config.sampler) return this.#config.sampler

    if (this.#config.samplingRatio !== undefined) {
      const ratio = Math.max(0, Math.min(1, this.#config.samplingRatio))
      return new ParentBasedSampler({ root: new TraceIdRatioBasedSampler(ratio) })
    }

    return undefined
  }

  /**
   * Build span processors, including debug console exporter if enabled
   */
  #buildSpanProcessors() {
    const processors = this.#config.spanProcessors ? [...this.#config.spanProcessors] : []

    if (this.#config.debug) processors.push(new SimpleSpanProcessor(new ConsoleSpanExporter()))

    return processors.length > 0 ? processors : undefined
  }

  /**
   * Create the NodeSDK instance with all configuration
   */
  #createSdk(): NodeSDK {
    const resource = this.#buildResource()
    const instrumentations = this.#buildInstrumentations()
    const sampler = this.#buildSampler()
    const spanProcessors = this.#buildSpanProcessors()

    return new NodeSDK({
      ...this.#config,
      resource,
      serviceName: this.serviceName,
      instrumentations,
      ...(sampler && { sampler }),
      ...(spanProcessors && { spanProcessors }),
    })
  }

  /**
   * Start the OpenTelemetry SDK
   */
  start(): void {
    debug(
      'starting otel sdk for service "%s" v%s (%s)',
      this.serviceName,
      this.serviceVersion,
      this.environment
    )
    this.sdk.start()
  }

  /**
   * Gracefully shutdown the OpenTelemetry SDK
   */
  async shutdown(): Promise<void> {
    debug('shutting down otel sdk')
    await this.sdk.shutdown()
  }

  /**
   * Check if OpenTelemetry should be enabled based on config.
   * Defaults to false when NODE_ENV === 'test'.
   */
  static isEnabled(config: OtelConfig): boolean {
    if (config.enabled !== undefined) return config.enabled

    return process.env.NODE_ENV !== 'test'
  }

  /**
   * Create and configure the OpenTelemetry SDK manager.
   *
   * Returns null if OpenTelemetry is disabled.
   *
   * @example
   * ```ts
   * import { OtelManager } from '@adonisjs/otel'
   * import config from '#config/otel'
   *
   * const manager = OtelManager.create(config)
   * manager?.start()
   *
   * // Later, on shutdown
   * await manager?.shutdown()
   * ```
   */
  static create(config: OtelConfig): OtelManager | null {
    if (!OtelManager.isEnabled(config)) return null

    OtelManager.#instance = new OtelManager(config)
    return OtelManager.#instance
  }

  /**
   * Get the global OtelManager instance.
   * Returns null if OpenTelemetry is disabled or not yet initialized.
   */
  static getInstance(): OtelManager | null {
    return OtelManager.#instance
  }
}
