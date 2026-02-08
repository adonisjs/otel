import { test } from '@japa/runner'
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

  test('preserves traceExporter when destinations add trace processors', ({ assert }) => {
    const traceExporter = {
      export: (spans: unknown[], resultCallback: (result: { code: number }) => void) => {
        void spans
        resultCallback({ code: 0 })
      },
      shutdown: async () => {},
      forceFlush: async () => {},
    }

    const manager = new OtelManager({
      traceExporter: traceExporter as any,
      destinations: {
        tracesOnly: destinations.otlp({
          endpoint: 'http://localhost:4318',
          signals: ['traces'],
        }),
      },
    })

    const tracerProviderConfig = (manager.sdk as any)._tracerProviderConfig
    const spanProcessors = (tracerProviderConfig?.spanProcessors ?? []) as any[]
    const hasConfiguredTraceExporterProcessor = spanProcessors.some(
      (processor) => processor?._exporter === traceExporter
    )

    assert.isTrue(hasConfiguredTraceExporterProcessor)
  })
})
