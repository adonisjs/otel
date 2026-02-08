import { test } from '@japa/runner'

import { DestinationManager } from '../src/destination_manager.js'
import { destinations } from '../src/destinations.js'

test.group('DestinationManager', () => {
  test('builds pipelines for all signals with a base endpoint', ({ assert }) => {
    const manager = new DestinationManager({
      lgtm: destinations.otlp({
        endpoint: 'http://localhost:4318',
      }),
    })

    const pipelines = manager.buildPipelines()

    assert.lengthOf(pipelines.spanProcessors ?? [], 1)
    assert.lengthOf(pipelines.metricReaders ?? [], 1)
    assert.lengthOf(pipelines.logRecordProcessors ?? [], 1)
  })

  test('supports per-signal endpoints', ({ assert }) => {
    const manager = new DestinationManager({
      lgtm: destinations.otlp({
        signals: ['traces', 'logs'],
        endpoints: {
          traces: 'http://localhost:4318/v1/traces',
          logs: 'http://localhost:4318/v1/logs',
        },
      }),
    })

    const pipelines = manager.buildPipelines()

    assert.lengthOf(pipelines.spanProcessors ?? [], 1)
    assert.isUndefined(pipelines.metricReaders)
    assert.lengthOf(pipelines.logRecordProcessors ?? [], 1)
  })

  test('ignores disabled destinations', ({ assert }) => {
    const manager = new DestinationManager({
      lgtm: destinations.otlp({
        endpoint: 'http://localhost:4318',
        enabled: false,
      }),
    })

    const pipelines = manager.buildPipelines()

    assert.isUndefined(pipelines.spanProcessors)
    assert.isUndefined(pipelines.metricReaders)
    assert.isUndefined(pipelines.logRecordProcessors)
  })

  test('fans out across multiple destinations', ({ assert }) => {
    const manager = new DestinationManager({
      lgtm: destinations.otlp({
        endpoint: 'http://localhost:4318',
      }),
      secondary: destinations.otlp({
        endpoint: 'http://localhost:4319',
      }),
    })

    const pipelines = manager.buildPipelines()

    assert.lengthOf(pipelines.spanProcessors ?? [], 2)
    assert.lengthOf(pipelines.metricReaders ?? [], 2)
    assert.lengthOf(pipelines.logRecordProcessors ?? [], 2)
  })

  test('falls back to OTLP defaults when selected signal has no endpoint', ({ assert }) => {
    const manager = new DestinationManager({
      metricsOnly: destinations.otlp({
        signals: ['metrics'],
      }),
    })

    const pipelines = manager.buildPipelines()
    assert.lengthOf(pipelines.metricReaders ?? [], 1)
  })

  test('accepts compression and batch options', ({ assert }) => {
    const manager = new DestinationManager({
      lgtm: destinations.otlp({
        endpoint: 'http://localhost:4318',
        compression: 'gzip' as any,
        maxExportBatchSize: 128,
        scheduledDelayMillis: 2000,
        exportTimeoutMillis: 10000,
        maxQueueSize: 1024,
      }),
    })

    const pipelines = manager.buildPipelines()

    assert.lengthOf(pipelines.spanProcessors ?? [], 1)
    assert.lengthOf(pipelines.metricReaders ?? [], 1)
    assert.lengthOf(pipelines.logRecordProcessors ?? [], 1)
  })
})
