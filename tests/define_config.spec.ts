import { test } from '@japa/runner'
import {
  InstrumentationBase,
  type InstrumentationNodeModuleDefinition,
} from '@opentelemetry/instrumentation'

import { defineConfig } from '../src/define_config.js'
import { destinations } from '../src/destinations.js'

/**
 * A mock custom instrumentation for testing purposes
 */
class MockCustomInstrumentation extends InstrumentationBase {
  constructor() {
    super('mock-custom-instrumentation', '1.0.0', {})
  }

  init(): InstrumentationNodeModuleDefinition[] {
    return []
  }
}

/**
 * These tests verify type safety at compile time.
 * If the types are wrong, TypeScript will fail to compile.
 */
test.group('defineConfig | type safety (compile-time)', () => {
  test('accepts custom instrumentations via any string key', ({ assert }) => {
    const config = defineConfig({
      instrumentations: {
        '@julr/otel-instrumentation-clickhouse': new MockCustomInstrumentation(),
      },
    })

    assert.isDefined(config.instrumentations)
  })

  test('accepts http instrumentation with extended config', ({ assert }) => {
    const config = defineConfig({
      instrumentations: {
        '@opentelemetry/instrumentation-http': {
          ignoredUrls: ['/health'],
          mergeIgnoredUrls: true,
          ignoreStaticFiles: false,
          ignoreOptionsRequests: true,
        },
      },
    })

    assert.isDefined(config.instrumentations)
  })

  test('accepts pino instrumentation with extended config', ({ assert }) => {
    const config = defineConfig({
      instrumentations: {
        '@opentelemetry/instrumentation-pino': {
          logHook: (_span, _record) => {},
        },
      },
    })

    assert.isDefined(config.instrumentations)
  })

  test('accepts known instrumentation with typed config', ({ assert }) => {
    // This tests that @opentelemetry/instrumentation-pg config is properly typed
    const config = defineConfig({
      instrumentations: {
        '@opentelemetry/instrumentation-pg': {
          enhancedDatabaseReporting: true,
        },
      },
    })

    assert.isDefined(config.instrumentations)
  })

  test('accepts disabling known instrumentations', ({ assert }) => {
    const config = defineConfig({
      instrumentations: {
        '@opentelemetry/instrumentation-pg': { enabled: false },
        '@opentelemetry/instrumentation-redis': { enabled: false },
        '@opentelemetry/instrumentation-mongodb': { enabled: false },
      },
    })

    assert.isDefined(config.instrumentations)
  })

  test('accepts redis instrumentation config', ({ assert }) => {
    const config = defineConfig({
      instrumentations: {
        '@opentelemetry/instrumentation-redis': {
          dbStatementSerializer: (_cmdName, _cmdArgs) => 'redacted',
        },
      },
    })

    assert.isDefined(config.instrumentations)
  })

  test('accepts multiple instrumentations together', ({ assert }) => {
    const config = defineConfig({
      instrumentations: {
        '@opentelemetry/instrumentation-http': {
          ignoredUrls: ['/internal/*'],
          mergeIgnoredUrls: true,
        },
        '@opentelemetry/instrumentation-pg': {
          enhancedDatabaseReporting: true,
        },
        '@opentelemetry/instrumentation-redis': { enabled: false },
        '@opentelemetry/instrumentation-pino': {
          logHook: () => {},
        },
        '@my-company/custom-instrumentation': new MockCustomInstrumentation(),
      },
    })

    assert.isDefined(config.instrumentations)
  })

  test('accepts disabling custom instrumentations', ({ assert }) => {
    const config = defineConfig({
      instrumentations: {
        '@julr/otel-instrumentation-clickhouse': { enabled: false },
      },
    })

    assert.isDefined(config.instrumentations)
  })

  test('accepts OTLP destinations configuration', ({ assert }) => {
    const config = defineConfig({
      destinations: {
        default: destinations.otlp({
          endpoint: 'https://otlp.example.com',
          headers: {
            Authorization: 'Bearer token',
          },
        }),
        tracesOnly: destinations.otlp({
          signals: ['traces'],
          endpoints: {
            traces: 'https://trace-only.example.com/v1/traces',
          },
        }),
      },
    })

    assert.isDefined(config.destinations)
  })
})

test.group('defineConfig | runtime behavior', () => {
  test('returns the same config object', ({ assert }) => {
    const input = {
      serviceName: 'test-service',
      instrumentations: {
        '@custom/instrumentation': new MockCustomInstrumentation(),
      },
    }

    const result = defineConfig(input)

    assert.strictEqual(result, input)
  })

  test('preserves custom instrumentation instance', ({ assert }) => {
    const customInstrumentation = new MockCustomInstrumentation()
    const config = defineConfig({
      instrumentations: {
        '@custom/instrumentation': customInstrumentation,
      },
    })

    assert.strictEqual(config.instrumentations?.['@custom/instrumentation'], customInstrumentation)
  })

  test('preserves all config properties', ({ assert }) => {
    const config = defineConfig({
      serviceName: 'my-service',
      serviceVersion: '1.0.0',
      environment: 'production',
      enabled: true,
      debug: false,
      samplingRatio: 0.5,
      instrumentations: {
        '@opentelemetry/instrumentation-http': {
          ignoredUrls: ['/health'],
        },
        '@custom/instrumentation': new MockCustomInstrumentation(),
      },
    })

    assert.equal(config.serviceName, 'my-service')
    assert.equal(config.serviceVersion, '1.0.0')
    assert.equal(config.environment, 'production')
    assert.equal(config.enabled, true)
    assert.equal(config.debug, false)
    assert.equal(config.samplingRatio, 0.5)
    assert.deepEqual(config.instrumentations?.['@opentelemetry/instrumentation-http'], {
      ignoredUrls: ['/health'],
    })
  })

  test('preserves destinations config', ({ assert }) => {
    const config = defineConfig({
      destinations: {
        multi: destinations.otlp({
          name: 'multi',
          endpoint: 'https://otlp.example.com',
          signals: 'all',
        }),
      },
    })

    assert.equal(Object.keys(config.destinations ?? {}).length, 1)
    assert.equal(config.destinations?.multi.type, 'otlp')
    assert.equal(config.destinations?.multi.name, 'multi')
  })
})
