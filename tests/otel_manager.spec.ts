import { test } from '@japa/runner'
import { execFile } from 'node:child_process'
import { once } from 'node:events'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { promisify } from 'node:util'
import { OtelManager } from '../src/otel.js'
import { destinations } from '../src/destinations.js'

test.group('OtelManager', (group) => {
  const originalEnv = { ...process.env }

  group.each.setup(() => {
    process.env = { ...originalEnv }
    delete process.env.OTEL_SERVICE_NAME
    delete process.env.APP_NAME
    delete process.env.APP_VERSION
    delete process.env.APP_ENV
  })

  group.each.teardown(() => {
    process.env = originalEnv
  })

  test('resolves service name from config', ({ assert }) => {
    const manager = new OtelManager({ serviceName: 'my-service' })
    assert.equal(manager.serviceName, 'my-service')
  })

  test('resolves service name from OTEL_SERVICE_NAME env var', ({ assert }) => {
    process.env.OTEL_SERVICE_NAME = 'otel-service'
    const manager = new OtelManager({})
    assert.equal(manager.serviceName, 'otel-service')
  })

  test('resolves service name from APP_NAME env var', ({ assert }) => {
    process.env.APP_NAME = 'app-service'
    const manager = new OtelManager({})
    assert.equal(manager.serviceName, 'app-service')
  })

  test('config takes precedence over env vars for service name', ({ assert }) => {
    process.env.OTEL_SERVICE_NAME = 'otel-service'
    process.env.APP_NAME = 'app-service'
    const manager = new OtelManager({ serviceName: 'config-service' })
    assert.equal(manager.serviceName, 'config-service')
  })

  test('OTEL_SERVICE_NAME takes precedence over APP_NAME', ({ assert }) => {
    process.env.OTEL_SERVICE_NAME = 'otel-service'
    process.env.APP_NAME = 'app-service'
    const manager = new OtelManager({})
    assert.equal(manager.serviceName, 'otel-service')
  })

  test('defaults to unknown_service when no service name is provided', ({ assert }) => {
    const manager = new OtelManager({})
    assert.equal(manager.serviceName, 'unknown_service')
  })

  test('resolves service version from config', ({ assert }) => {
    const manager = new OtelManager({ serviceVersion: '2.0.0' })
    assert.equal(manager.serviceVersion, '2.0.0')
  })

  test('resolves service version from APP_VERSION env var', ({ assert }) => {
    process.env.APP_VERSION = '1.5.0'
    const manager = new OtelManager({})
    assert.equal(manager.serviceVersion, '1.5.0')
  })

  test('config takes precedence over env var for service version', ({ assert }) => {
    process.env.APP_VERSION = '1.5.0'
    const manager = new OtelManager({ serviceVersion: '2.0.0' })
    assert.equal(manager.serviceVersion, '2.0.0')
  })

  test('defaults to 0.0.0 when no service version is provided', ({ assert }) => {
    const manager = new OtelManager({})
    assert.equal(manager.serviceVersion, '0.0.0')
  })

  test('resolves environment from config', ({ assert }) => {
    const manager = new OtelManager({ environment: 'staging' })
    assert.equal(manager.environment, 'staging')
  })

  test('resolves environment from APP_ENV env var', ({ assert }) => {
    process.env.APP_ENV = 'production'
    const manager = new OtelManager({})
    assert.equal(manager.environment, 'production')
  })

  test('config takes precedence over env var for environment', ({ assert }) => {
    process.env.APP_ENV = 'production'
    const manager = new OtelManager({ environment: 'staging' })
    assert.equal(manager.environment, 'staging')
  })

  test('defaults to development when no environment is provided', ({ assert }) => {
    const manager = new OtelManager({})
    assert.equal(manager.environment, 'development')
  })

  test('creates a NodeSDK instance', ({ assert }) => {
    const manager = new OtelManager({})
    assert.isDefined(manager.sdk)
  })
})

test.group('OtelManager | HTTP instrumentation config', () => {
  test('accepts ignoredUrls in http instrumentation config', ({ assert }) => {
    // Should not throw when passing ignoredUrls in the HTTP config
    const manager = new OtelManager({
      instrumentations: {
        '@opentelemetry/instrumentation-http': {
          ignoredUrls: ['/custom-health', '/internal/*'],
          mergeIgnoredUrls: true,
        },
      },
    })

    assert.isDefined(manager.sdk)
  })

  test('accepts mergeIgnoredUrls false to replace defaults', ({ assert }) => {
    const manager = new OtelManager({
      instrumentations: {
        '@opentelemetry/instrumentation-http': {
          ignoredUrls: ['/only-this'],
          mergeIgnoredUrls: false,
        },
      },
    })

    assert.isDefined(manager.sdk)
  })

  test('accepts custom ignoreIncomingRequestHook', ({ assert }) => {
    const manager = new OtelManager({
      instrumentations: {
        '@opentelemetry/instrumentation-http': {
          ignoreIncomingRequestHook: (req) => req.url === '/skip-me',
        },
      },
    })

    assert.isDefined(manager.sdk)
  })
})

test.group('OtelManager | Pino instrumentation config', () => {
  test('accepts custom logHook that runs after internal hook', ({ assert }) => {
    const manager = new OtelManager({
      instrumentations: {
        '@opentelemetry/instrumentation-pino': {
          logHook: (_span, record) => {
            record.customProperty = 'test'
          },
        },
      },
    })

    assert.isDefined(manager.sdk)
  })
})

test.group('OtelManager | destinations', () => {
  test('accepts OTLP destination for all signals', ({ assert }) => {
    const manager = new OtelManager({
      destinations: {
        lgtm: destinations.otlp({
          endpoint: 'http://localhost:4318',
        }),
      },
    })

    assert.isDefined(manager.sdk)
  })

  test('supports per-signal OTLP endpoints', ({ assert }) => {
    const manager = new OtelManager({
      destinations: {
        lgtm: destinations.otlp({
          signals: ['traces', 'logs'],
          endpoints: {
            traces: 'http://localhost:4318/v1/traces',
            logs: 'http://localhost:4318/v1/logs',
          },
        }),
      },
    })

    assert.isDefined(manager.sdk)
  })

  test('accepts destinations without explicit endpoint (OTLP defaults/env)', ({ assert }) => {
    const manager = new OtelManager({
      destinations: {
        metricsOnly: destinations.otlp({
          signals: ['metrics'],
        }),
      },
    })

    assert.isDefined(manager.sdk)
  })

  test('preserves traceExporter when destinations add trace processors', async ({ assert }) => {
    const destinationSpans: string[] = []
    const server = createServer(async (request, response) => {
      const chunks: Buffer[] = []
      for await (const chunk of request) chunks.push(chunk)
      const body = JSON.parse(Buffer.concat(chunks).toString())
      for (const resource of body.resourceSpans) {
        for (const scope of resource.scopeSpans) {
          for (const span of scope.spans) destinationSpans.push(span.name)
        }
      }
      response.setHeader('content-type', 'application/json')
      response.end('{}')
    })
    server.listen(0, '127.0.0.1')
    await once(server, 'listening')

    try {
      const { port } = server.address() as AddressInfo
      // Isolate the SDK's global providers from the other tracing tests.
      const { stdout } = await promisify(execFile)(
        process.execPath,
        [
          '--import',
          new URL('../tsnode.esm.js', import.meta.url).href,
          '--input-type=module',
          '--eval',
          `
            import { trace } from '@opentelemetry/api'
            import { OtelManager } from ${JSON.stringify(new URL('../src/otel.js', import.meta.url).href)}
            const exported = []
            const manager = new OtelManager({
              autoDetectResources: false,
              logRecordProcessors: [],
              metricReaders: [],
              traceExporter: {
                export(spans, callback) {
                  exported.push(...spans.map(span => span.name))
                  callback({ code: 0 })
                },
                async shutdown() {},
              },
              destinations: {
                tracesOnly: {
                  type: 'otlp', enabled: true, signals: ['traces'],
                  endpoint: 'http://127.0.0.1:${port}',
                },
              },
            })
            manager.start()
            trace.getTracer('destination-test').startSpan('retained-exporter').end()
            await manager.shutdown()
            console.log(JSON.stringify(exported))
          `,
        ],
        { timeout: 15_000 }
      )
      assert.deepEqual(JSON.parse(stdout), ['retained-exporter'])
      assert.deepEqual(destinationSpans, ['retained-exporter'])
    } finally {
      server.closeAllConnections()
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()))
      })
    }
  }).timeout(20_000)
})
