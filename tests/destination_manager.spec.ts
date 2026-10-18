import { test } from '@japa/runner'
import { LoggerProvider } from '@opentelemetry/sdk-logs'
import { once } from 'node:events'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'

import { DestinationManager } from '../src/destination_manager.js'
import { destinations } from '../src/destinations.js'

test.group('DestinationManager', () => {
  test('exports buffered logs to the configured destination on shutdown', async ({ assert }) => {
    const requests: { url?: string; token?: string; body: any }[] = []
    const server = createServer(async (request, response) => {
      const chunks: Buffer[] = []
      for await (const chunk of request) chunks.push(chunk)
      requests.push({
        url: request.url,
        token: request.headers['x-test-token'] as string,
        body: JSON.parse(Buffer.concat(chunks).toString()),
      })
      response.setHeader('content-type', 'application/json')
      response.end('{}')
    })
    server.listen(0, '127.0.0.1')
    await once(server, 'listening')

    try {
      const { port } = server.address() as AddressInfo
      const pipelines = new DestinationManager({
        logs: destinations.otlp({
          signals: ['logs'],
          endpoints: { logs: `http://127.0.0.1:${port}/custom-logs` },
          headers: { 'x-test-token': 'destination-test' },
          scheduledDelayMillis: 60_000,
        }),
      }).buildPipelines()
      const provider = new LoggerProvider({ processors: pipelines.logRecordProcessors })
      provider.getLogger('destination-test').emit({ body: 'buffered-log', severityNumber: 9 })
      await provider.shutdown()

      assert.lengthOf(requests, 1)
      assert.equal(requests[0].url, '/custom-logs')
      assert.equal(requests[0].token, 'destination-test')
      const scope = requests[0].body.resourceLogs[0].scopeLogs[0]
      assert.equal(scope.scope.name, 'destination-test')
      assert.equal(scope.logRecords[0].body.stringValue, 'buffered-log')
      assert.equal(scope.logRecords[0].severityNumber, 9)
    } finally {
      server.closeAllConnections()
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()))
      })
    }
  })

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
