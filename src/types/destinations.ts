import type { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http'
import type { BufferConfig } from '@opentelemetry/sdk-trace-base'

export type DestinationSignal = 'traces' | 'metrics' | 'logs'

export type DestinationSignals = 'all' | DestinationSignal[]

type OtlpExporterConfig = NonNullable<ConstructorParameters<typeof OTLPTraceExporter>[0]>
type DestinationBatchConfig = Pick<
  BufferConfig,
  'maxExportBatchSize' | 'scheduledDelayMillis' | 'exportTimeoutMillis' | 'maxQueueSize'
>

export interface OtlpDestinationOptions extends DestinationBatchConfig {
  /**
   * Optional label used in debug logs.
   */
  name?: string

  /**
   * Enable/disable this destination.
   * @default true
   */
  enabled?: boolean

  /**
   * Signals to export to this destination.
   * @default 'all'
   */
  signals?: DestinationSignals

  /**
   * OTLP base endpoint. Signal paths are appended automatically:
   * - /v1/traces
   * - /v1/metrics
   * - /v1/logs
   */
  endpoint?: string

  /**
   * Per-signal OTLP endpoints. When set, it overrides `endpoint` for that signal.
   */
  endpoints?: Partial<Record<DestinationSignal, string>>

  /**
   * Additional headers sent with each OTLP request.
   */
  headers?: Record<string, string>

  /**
   * Request timeout in milliseconds.
   */
  timeoutMillis?: number

  /**
   * Optional maximum number of pending HTTP requests.
   */
  concurrencyLimit?: number

  /**
   * OTLP payload compression algorithm.
   * @default 'none'
   */
  compression?: OtlpExporterConfig['compression']

  /**
   * Metrics export interval for this destination.
   */
  metricExportIntervalMillis?: number

  /**
   * Metrics export timeout for this destination.
   */
  metricExportTimeoutMillis?: number
}

export interface OtlpDestinationConfig extends OtlpDestinationOptions {
  type: 'otlp'
  enabled: boolean
  signals: DestinationSignals
}

export type DestinationConfig = OtlpDestinationConfig
export type DestinationMap = Record<string, DestinationConfig>
