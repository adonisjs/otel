import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-http'
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http'
import { BatchLogRecordProcessor } from '@opentelemetry/sdk-logs'
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics'
import type { NodeSDKConfiguration } from '@opentelemetry/sdk-node'
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-base'

import type { DestinationConfig, DestinationMap, DestinationSignal } from './types/destinations.js'
import debug from './debug.js'

/**
 * OTel SDK primitives built from configured destinations.
 *
 * These arrays are merged inside `OtelManager` with user-provided SDK options.
 */
export interface DestinationPipelines {
  spanProcessors?: NonNullable<NodeSDKConfiguration['spanProcessors']>
  metricReaders?: NonNullable<NodeSDKConfiguration['metricReaders']>
  logRecordProcessors?: NonNullable<NodeSDKConfiguration['logRecordProcessors']>
}

/**
 * Transforms high-level `destinations` config into concrete OTel exporters/processors.
 */
export class DestinationManager {
  readonly destinations: DestinationMap

  /**
   * @param destinations Destination map from `OtelConfig.destinations`.
   */
  constructor(destinations: DestinationMap | undefined) {
    if (!destinations) {
      this.destinations = {}
      return
    }

    this.destinations = destinations
  }

  #resolveSignals(destination: DestinationConfig): Set<DestinationSignal> {
    if (destination.signals === 'all') {
      return new Set<DestinationSignal>(['traces', 'metrics', 'logs'])
    }

    return new Set(destination.signals)
  }

  /**
   * Resolve the final endpoint for one signal.
   *
   * Priority:
   * 1) `destination.endpoints[signal]`
   * 2) `destination.endpoint` + `/v1/{signal}`
   * 3) `undefined` (OTel exporter applies env/default fallback)
   */
  #resolveEndpoint(destination: DestinationConfig, signal: DestinationSignal): string | undefined {
    const signalEndpoint = destination.endpoints?.[signal]
    if (signalEndpoint) return signalEndpoint

    if (destination.endpoint) {
      return `${destination.endpoint.replace(/\/$/, '')}/v1/${signal}`
    }

    return undefined
  }

  /**
   * Batch processor options shared by trace and logs processors.
   */
  #resolveBatchProcessorConfig(destination: DestinationConfig) {
    return {
      ...(destination.maxExportBatchSize !== undefined && {
        maxExportBatchSize: destination.maxExportBatchSize,
      }),
      ...(destination.scheduledDelayMillis !== undefined && {
        scheduledDelayMillis: destination.scheduledDelayMillis,
      }),
      ...(destination.exportTimeoutMillis !== undefined && {
        exportTimeoutMillis: destination.exportTimeoutMillis,
      }),
      ...(destination.maxQueueSize !== undefined && {
        maxQueueSize: destination.maxQueueSize,
      }),
    }
  }

  /**
   * Build span processors, metric readers and log processors for every enabled destination.
   *
   * One destination can receive all signals or only a subset via `signals`.
   * Multiple destinations create multiple exporters, enabling fan-out.
   */
  buildPipelines(): DestinationPipelines {
    const spanProcessors: NonNullable<NodeSDKConfiguration['spanProcessors']> = []
    const metricReaders: NonNullable<NodeSDKConfiguration['metricReaders']> = []
    const logRecordProcessors: NonNullable<NodeSDKConfiguration['logRecordProcessors']> = []

    for (const [destinationKey, destination] of Object.entries(this.destinations)) {
      if (!destination.enabled) continue

      const signals = this.#resolveSignals(destination)
      const destinationName = destination.name ?? destinationKey
      const headers = destination.headers
      const timeoutMillis = destination.timeoutMillis
      const concurrencyLimit = destination.concurrencyLimit
      const compression = destination.compression
      const batchProcessorConfig = this.#resolveBatchProcessorConfig(destination)

      if (signals.has('traces')) {
        const url = this.#resolveEndpoint(destination, 'traces')

        const exporter = new OTLPTraceExporter({
          ...(url && { url }),
          ...(headers && { headers }),
          ...(timeoutMillis !== undefined && { timeoutMillis }),
          ...(concurrencyLimit !== undefined && { concurrencyLimit }),
          ...(compression !== undefined && { compression }),
        })

        spanProcessors.push(new BatchSpanProcessor(exporter, batchProcessorConfig))
      }

      if (signals.has('metrics')) {
        const url = this.#resolveEndpoint(destination, 'metrics')

        const exporter = new OTLPMetricExporter({
          ...(url && { url }),
          ...(headers && { headers }),
          ...(timeoutMillis !== undefined && { timeoutMillis }),
          ...(concurrencyLimit !== undefined && { concurrencyLimit }),
          ...(compression !== undefined && { compression }),
        })

        metricReaders.push(
          new PeriodicExportingMetricReader({
            exporter,
            ...(destination.metricExportIntervalMillis !== undefined && {
              exportIntervalMillis: destination.metricExportIntervalMillis,
            }),
            ...(destination.metricExportTimeoutMillis !== undefined && {
              exportTimeoutMillis: destination.metricExportTimeoutMillis,
            }),
          })
        )
      }

      if (signals.has('logs')) {
        const url = this.#resolveEndpoint(destination, 'logs')

        const exporter = new OTLPLogExporter({
          ...(url && { url }),
          ...(headers && { headers }),
          ...(timeoutMillis !== undefined && { timeoutMillis }),
          ...(concurrencyLimit !== undefined && { concurrencyLimit }),
          ...(compression !== undefined && { compression }),
        })

        logRecordProcessors.push(new BatchLogRecordProcessor(exporter, batchProcessorConfig))
      }

      debug('configured destination "%s" for signals: %O', destinationName, [...signals])
    }

    return {
      spanProcessors: spanProcessors.length > 0 ? spanProcessors : undefined,
      metricReaders: metricReaders.length > 0 ? metricReaders : undefined,
      logRecordProcessors: logRecordProcessors.length > 0 ? logRecordProcessors : undefined,
    }
  }
}
