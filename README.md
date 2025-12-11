# @adonisjs/otel

> OpenTelemetry integration for AdonisJS with sensible defaults and zero-config setup.

[![npm-image]][npm-url] [![license-image]][license-url]

This package provides a seamless integration between AdonisJS and OpenTelemetry, giving you distributed tracing, metrics, and automatic instrumentation out of the box.

## Installation

```sh
node ace add @adonisjs/otel
```

## Setup

The `node ace add` command automatically configures everything for you:

- Creates `bin/otel.ts` with the OpenTelemetry initialization
- Adds the import at the top of `bin/server.ts` (must be first for auto-instrumentation)
- Registers the provider and middleware
- Sets up environment variables

That's it! Your application now has automatic tracing for HTTP requests, database queries, and more.

### Why first import matters

OpenTelemetry requires early initialization **before** your application loads. The SDK must be initialized before any instrumented libraries (like `http`, `pg`, `redis`, etc.) are imported. That's why `bin/otel.ts` is imported as the very first line in `bin/server.ts`.

> **Important**: If you move or remove the `import './otel.js'` line, auto-instrumentation will not work. You'll still be able to create manual spans, but automatic tracing won't be captured.

## Manual setup

If you prefer not to use `node ace add`, here's what it configures:

### 1. OpenTelemetry initialization

Create a file at `bin/otel.ts`:

```ts
import { init } from '@adonisjs/otel/init'

await init(import.meta.dirname)
```

Then update your `bin/server.ts` to import it **as the very first line**:

```ts
/**
 * OpenTelemetry initialization - MUST be the first import
 * @see https://opentelemetry.io/docs/languages/js/getting-started/nodejs/
 */
import './otel.js'

import { Ignitor } from '@adonisjs/core'
// ...
```

### 2. Provider registration

Add the provider in `adonisrc.ts`:

```ts
{
  providers: [
    // ...other providers
    () => import('@adonisjs/otel/otel_provider'),
  ]
}
```

The provider automatically hooks into AdonisJS's `ExceptionHandler` to record exceptions in spans.

### 3. Middleware registration

Add the middleware as the **first** router middleware in `start/kernel.ts`:

```ts
router.use([
  () => import('@adonisjs/otel/otel_middleware'), // Must be first!
  // ...other middlewares
])
```

The middleware enriches HTTP spans with AdonisJS route information (pattern, name, response status).

## Configuration

The configuration file is located at `config/otel.ts`. The default configuration is intentionally simple with sensible defaults:

```ts
import { defineConfig } from '@adonisjs/otel'
import env from '#start/env'

export default defineConfig({
  serviceName: env.get('APP_NAME'),
  serviceVersion: env.get('APP_VERSION'),
  environment: env.get('APP_ENV'),
})
```

### Sensible defaults

Out of the box, the package provides:

- **OTLP exporters** configured for gRPC (standard OpenTelemetry protocol)
- **Auto-instrumentation** for HTTP, Lucid (knex), Redis, and more
- **Disabled noisy instrumentations** like `dns` and `net`
- **Health check endpoints ignored** to reduce trace noise
- **Pino log injection** with route information

### Advanced configuration

Under the hood, this package uses the [OpenTelemetry Node SDK](https://opentelemetry.io/docs/languages/js/getting-started/nodejs/). The `defineConfig` function accepts all options from [`NodeSDKConfiguration`](hhttps://opentelemetry.io/docs/languages/js/getting-started/nodejs/), so power users have full control:

```ts
import { defineConfig } from '@adonisjs/otel'
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-base'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http'

export default defineConfig({
  serviceName: 'my-app',

  // Use HTTP instead of gRPC
  traceExporter: new OTLPTraceExporter({
    url: 'https://otel-collector.example.com/v1/traces',
    headers: { 'x-api-key': process.env.OTEL_API_KEY },
  }),

  // Custom span processor
  spanProcessors: [
    new BatchSpanProcessor(new OTLPTraceExporter(), {
      maxQueueSize: 2048,
      scheduledDelayMillis: 5000,
    }),
  ],

  // Custom resource attributes
  resourceAttributes: {
    'deployment.region': 'eu-west-1',
    'k8s.pod.name': process.env.POD_NAME,
  },
})
```

See the [OpenTelemetry JS documentation](https://opentelemetry.io/docs/languages/js/) for all available options.

### Service identification

The package automatically resolves service metadata from multiple sources:

| Option           | Environment Variable              | Default           |
| ---------------- | --------------------------------- | ----------------- |
| `serviceName`    | `OTEL_SERVICE_NAME` or `APP_NAME` | `unknown_service` |
| `serviceVersion` | `APP_VERSION`                     | `0.0.0`           |
| `environment`    | `NODE_ENV`                        | `development`     |

### Enabling/Disabling

OpenTelemetry is **automatically disabled** when `NODE_ENV === 'test'` to avoid noise during tests. You can override this:

```ts
defineConfig({
  // Force enable in tests
  enabled: true,

  // Or force disable in any environment
  enabled: false,
})
```

### Sampling

Control how many traces are collected with `samplingRatio`:

```ts
defineConfig({
  // Sample 10% of traces (useful in high-traffic production)
  samplingRatio: 0.1,

  // Sample 100% of traces (default)
  samplingRatio: 1.0,

  // Sample no traces
  samplingRatio: 0.0,
})
```

The sampler uses parent-based sampling, meaning child spans inherit the sampling decision from their parent. This ensures complete traces.

> **Note**: If you provide a custom `sampler` option, `samplingRatio` is ignored.

### Debug Mode

Enable debug mode to print spans to the console for local development:

```ts
defineConfig({
  debug: true,
})
```

This automatically adds a `ConsoleSpanExporter` to help visualize your traces during development.

### Instrumentations

The package includes automatic instrumentations for common libraries. You can customize them:

```ts
defineConfig({
  instrumentations: {
    // HTTP instrumentation with URL filtering
    '@opentelemetry/instrumentation-http': {
      // Add custom ignored URLs (merged with defaults)
      ignoredUrls: ['/internal/*', '/api/ping'],
      // Set to false to replace defaults instead of merging
      mergeIgnoredUrls: true,
      // Custom hook for advanced filtering
      ignoreIncomingRequestHook: (req) => req.url?.startsWith('/custom'),
    },

    // Pino instrumentation with custom log hook
    '@opentelemetry/instrumentation-pino': {
      // Add custom properties to log records
      logHook: (span, record) => {
        record.tenant_id = getCurrentTenantId()
      },
    },

    // Disable an instrumentation
    '@opentelemetry/instrumentation-pg': { enabled: false },

    // Use a custom instrumentation
    'my-custom-instrumentation': new CacheInstrumentation({ ... }),
  },
})
```

#### Default ignored URLs

By default, the following endpoints are excluded from tracing to reduce noise:

- `/health`, `/healthz`, `/ready`, `/readiness`
- `/metrics`, `/internal/metrics`, `/internal/healthz`
- `/favicon.ico`

#### Pino log hook

The package automatically adds `http.route` to log records via an internal hook. When you provide your own `logHook`, it runs **after** the internal one, so you can add additional properties without losing route information.

## Helpers

Helpers are available from `@adonisjs/otel/helpers`:

### `getCurrentSpan`

Get the currently active span:

```ts
import { getCurrentSpan } from '@adonisjs/otel/helpers'

function myUtility() {
  const span = getCurrentSpan()
  span?.setAttributes({ 'custom.attribute': 'value' })
}
```

### `setAttributes`

Convenience wrapper to set attributes on the active span:

```ts
import { setAttributes } from '@adonisjs/otel/helpers'

function processOrder(orderId: string) {
  setAttributes({
    'order.id': orderId,
    'order.type': 'subscription',
  })
}
```

### `record`

Create a span around a code section:

```ts
import { record } from '@adonisjs/otel/helpers'

// Sync
const result = record('database.query', () => {
  return db.query('SELECT * FROM users')
})

// Async
const user = await record('user.fetch', async () => {
  return await userService.findById(id)
})

// With span access
const order = await record('order.process', async (span) => {
  span.setAttributes({ 'order.id': orderId })
  return await processOrder(orderId)
})
```

### `setUser`

Set user information on the current span:

```ts
import { setUser } from '@adonisjs/otel/helpers'

// In a controller or middleware
setUser({
  id: auth.user.id,
  email: auth.user.email,
  role: auth.user.role,
})
```

> **Note**: When using `@adonisjs/auth`, the middleware automatically sets user attributes if a user is authenticated.

### `injectTraceContext` / `extractTraceContext`

Propagate trace context across service boundaries (HTTP calls, queues, background jobs):

```ts
import { injectTraceContext, extractTraceContext, record } from '@adonisjs/otel/helpers'
import { context } from '@adonisjs/otel'

// Inject into outgoing request headers
const headers = {}
injectTraceContext(headers)
await fetch('https://api.example.com', { headers })

// Inject into queue job
const jobHeaders = {}
injectTraceContext(jobHeaders)
await queue.dispatch('process-order', { orderId }, { headers: jobHeaders })
```

In the receiving service or queue worker:

```ts
// Extract context and continue the trace
const extractedContext = extractTraceContext(job.headers)

context.with(extractedContext, () => {
  record('process-job', () => {
    // This span will be a child of the original trace
  })
})
```

### `recordEvent`

Record events (time-stamped annotations) on the current span:

```ts
import { recordEvent } from '@adonisjs/otel/helpers'

// Simple event
recordEvent('cache.miss')

// Event with attributes
recordEvent('order.processed', {
  'order.id': orderId,
  'order.total': 99.99,
})
```

## Decorators

Decorators are available from `@adonisjs/otel/decorators`:

```ts
import { span, spanAll } from '@adonisjs/otel/decorators'
```

### `@span`

Create a span around a class method:

```ts
import { span } from '@adonisjs/otel/decorators'

class UserService {
  @span()
  async findById(id: string) {
    // Span name: "UserService.findById"
    return db.users.find(id)
  }

  @span({ name: 'user.create', attributes: { operation: 'create' } })
  async create(data: UserData) {
    return db.users.create(data)
  }
}
```

### `@spanAll`

Automatically create spans for all methods of a class:

```ts
import { spanAll } from '@adonisjs/otel/decorators'

@spanAll()
class OrderService {
  async create(data: OrderData) {
    // Span name: "OrderService.create"
    return db.orders.create(data)
  }

  async findById(id: string) {
    // Span name: "OrderService.findById"
    return db.orders.find(id)
  }
}

// With custom prefix
@spanAll({ prefix: 'order' })
class OrderService {
  async create(data: OrderData) {
    // Span name: "order.create"
    return db.orders.create(data)
  }
}
```

## Automatic features

### Exception reporting

The package automatically records exceptions in spans when errors are thrown in your application. This is handled by the provider which hooks into AdonisJS's `ExceptionHandler`.

### Route enrichment

HTTP spans are automatically enriched with AdonisJS route information:
- Span name becomes `GET /users/:id` instead of just `GET`
- `http.route` attribute contains the route pattern
- `adonis.route.name` contains the named route (if defined)

### User context

When `@adonisjs/auth` is installed, the middleware automatically sets [user attributes](https://opentelemetry.io/docs/specs/semconv/registry/attributes/user/) on spans if a user is authenticated:
- `user.id` - User ID
- `user.email` - User email (if available)
- `user.roles` - User roles (if available)

You can customize or disable this behavior:

```ts
defineConfig({
  // Disable user context entirely
  userContext: false,

  // Or customize with a resolver
  userContext: {
    // Disable without removing the config
    enabled: false,

    // Custom resolver for user extraction
    resolver: async (ctx) => {
      if (!ctx.auth.user) return null
      return {
        id: ctx.auth.user.id,
        tenantId: ctx.auth.user.tenantId,
        plan: ctx.auth.user.plan,
      }
    },
  },
})
```

The resolver function receives the `HttpContext` and should return an object with at least an `id` property. Return `null` to skip setting user context for the request. Any additional properties you return will be set as `user.<key>` span attributes.

## Logging integration

When using `pino-pretty` for development logging, you can hide OpenTelemetry-injected fields for cleaner output:

```ts
// config/logger.ts
import { otelLoggingPreset } from '@adonisjs/otel/helpers'

export default defineConfig({
  default: 'app',
  loggers: {
    app: {
      transport: {
        targets: targets()
          .pushIf(!app.inProduction, targets.pretty({ ...otelLoggingPreset() }))
          .toArray(),
      },
    },
  },
})
```

This hides fields like `trace_id`, `span_id`, `pid`, `hostname`, etc. You can selectively keep some:

```ts
otelLoggingPreset({ keep: ['trace_id', 'span_id'] }) // Keep trace context visible
```

[npm-image]: https://img.shields.io/npm/v/@adonisjs/otel.svg?style=for-the-badge&logo=npm
[npm-url]: https://npmjs.org/package/@adonisjs/otel
[license-image]: https://img.shields.io/npm/l/@adonisjs/otel?color=blueviolet&style=for-the-badge
[license-url]: LICENSE.md
