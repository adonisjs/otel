import { test } from '@japa/runner'
import { trace } from '@opentelemetry/api'
import { setupTracing, resetSpans, getFinishedSpans } from './helpers/setup_tracing.js'
import OtelMiddleware from '../src/middleware/otel_middleware.js'

test.group('OtelMiddleware', (group) => {
  group.setup(() => {
    setupTracing()
  })

  group.each.setup(() => {
    resetSpans()
  })

  test('does nothing when no active span', async ({ assert }) => {
    const middleware = new OtelMiddleware({})
    const ctx = createMockContext({ route: { pattern: '/users', name: 'users.index' } })
    let nextCalled = false

    await middleware.handle(ctx, async () => {
      nextCalled = true
    })

    assert.isTrue(nextCalled)
  })

  test('updates span name with route pattern', async ({ assert }) => {
    const middleware = new OtelMiddleware({})
    const ctx = createMockContext({
      route: { pattern: '/users/:id', name: 'users.show' },
      method: 'GET',
    })
    const tracer = trace.getTracer('test')

    await tracer.startActiveSpan('http-request', async (span) => {
      await middleware.handle(ctx, async () => {})
      span.end()
    })

    const spans = getFinishedSpans()
    assert.lengthOf(spans, 1)
    assert.equal(spans[0].name, 'GET /users/:id')
  })

  test('sets http.route attribute', async ({ assert }) => {
    const middleware = new OtelMiddleware({})
    const ctx = createMockContext({
      route: { pattern: '/api/orders', name: 'orders.index' },
      method: 'POST',
    })
    const tracer = trace.getTracer('test')

    await tracer.startActiveSpan('http-request', async (span) => {
      await middleware.handle(ctx, async () => {})
      span.end()
    })

    const spans = getFinishedSpans()
    assert.lengthOf(spans, 1)
    assert.equal(spans[0].attributes['http.route'], '/api/orders')
  })

  test('sets adonis.route.name attribute', async ({ assert }) => {
    const middleware = new OtelMiddleware({})
    const ctx = createMockContext({
      route: { pattern: '/users', name: 'users.list' },
    })
    const tracer = trace.getTracer('test')

    await tracer.startActiveSpan('http-request', async (span) => {
      await middleware.handle(ctx, async () => {})
      span.end()
    })

    const spans = getFinishedSpans()
    assert.lengthOf(spans, 1)
    assert.equal(spans[0].attributes['adonis.route.name'], 'users.list')
  })

  test('sets adonis.route.name to unknown when route has no name', async ({ assert }) => {
    const middleware = new OtelMiddleware({})
    const ctx = createMockContext({
      route: { pattern: '/health' },
    })
    const tracer = trace.getTracer('test')

    await tracer.startActiveSpan('http-request', async (span) => {
      await middleware.handle(ctx, async () => {})
      span.end()
    })

    const spans = getFinishedSpans()
    assert.lengthOf(spans, 1)
    assert.equal(spans[0].attributes['adonis.route.name'], 'unknown')
  })

  test('sets http.response.status_code attribute', async ({ assert }) => {
    const middleware = new OtelMiddleware({})
    const ctx = createMockContext({
      route: { pattern: '/users' },
      responseStatus: 201,
    })
    const tracer = trace.getTracer('test')

    await tracer.startActiveSpan('http-request', async (span) => {
      await middleware.handle(ctx, async () => {})
      span.end()
    })

    const spans = getFinishedSpans()
    assert.lengthOf(spans, 1)
    assert.equal(spans[0].attributes['http.response.status_code'], 201)
  })

  test('sets user attributes when auth.user is present', async ({ assert }) => {
    const middleware = new OtelMiddleware({})
    const ctx = createMockContext({
      route: { pattern: '/profile' },
      auth: {
        user: { id: 42, email: 'user@example.com', role: 'admin' },
      },
    })
    const tracer = trace.getTracer('test')

    await tracer.startActiveSpan('http-request', async (span) => {
      await middleware.handle(ctx, async () => {})
      span.end()
    })

    const spans = getFinishedSpans()
    assert.lengthOf(spans, 1)
    assert.equal(spans[0].attributes['user.id'], '42')
    assert.equal(spans[0].attributes['user.email'], 'user@example.com')
    assert.deepEqual(spans[0].attributes['user.roles'], ['admin'])
  })

  test('handles user with userId field via custom resolver', async ({ assert }) => {
    const middleware = new OtelMiddleware({
      userContext: {
        resolver: (ctx) => {
          const user = ctx.auth?.user as Record<string, unknown>
          if (!user) return null
          return { id: (user.userId ?? user.id) as string }
        },
      },
    })
    const ctx = createMockContext({
      route: { pattern: '/profile' },
      auth: {
        user: { userId: 'usr-123' },
      },
    })
    const tracer = trace.getTracer('test')

    await tracer.startActiveSpan('http-request', async (span) => {
      await middleware.handle(ctx, async () => {})
      span.end()
    })

    const spans = getFinishedSpans()
    assert.lengthOf(spans, 1)
    assert.equal(spans[0].attributes['user.id'], 'usr-123')
  })

  test('handles user with _id field (MongoDB style) via custom resolver', async ({ assert }) => {
    const middleware = new OtelMiddleware({
      userContext: {
        resolver: (ctx) => {
          const user = ctx.auth?.user as Record<string, unknown>
          if (!user) return null
          return { id: (user._id ?? user.id) as string }
        },
      },
    })
    const ctx = createMockContext({
      route: { pattern: '/profile' },
      auth: {
        user: { _id: 'mongo-id-123' },
      },
    })
    const tracer = trace.getTracer('test')

    await tracer.startActiveSpan('http-request', async (span) => {
      await middleware.handle(ctx, async () => {})
      span.end()
    })

    const spans = getFinishedSpans()
    assert.lengthOf(spans, 1)
    assert.equal(spans[0].attributes['user.id'], 'mongo-id-123')
  })

  test('does not set user attributes when auth is not present', async ({ assert }) => {
    const middleware = new OtelMiddleware({})
    const ctx = createMockContext({
      route: { pattern: '/public' },
    })
    const tracer = trace.getTracer('test')

    await tracer.startActiveSpan('http-request', async (span) => {
      await middleware.handle(ctx, async () => {})
      span.end()
    })

    const spans = getFinishedSpans()
    assert.lengthOf(spans, 1)
    assert.isUndefined(spans[0].attributes['user.id'])
  })

  test('does not set user attributes when auth.user is null', async ({ assert }) => {
    const middleware = new OtelMiddleware({})
    const ctx = createMockContext({
      route: { pattern: '/public' },
      auth: { user: null as any },
    })
    const tracer = trace.getTracer('test')

    await tracer.startActiveSpan('http-request', async (span) => {
      await middleware.handle(ctx, async () => {})
      span.end()
    })

    const spans = getFinishedSpans()
    assert.lengthOf(spans, 1)
    assert.isUndefined(spans[0].attributes['user.id'])
  })

  test('returns output from next function', async ({ assert }) => {
    const middleware = new OtelMiddleware({})
    const ctx = createMockContext({ route: { pattern: '/test' } })
    const tracer = trace.getTracer('test')

    let result: unknown
    await tracer.startActiveSpan('http-request', async (span) => {
      result = await middleware.handle(ctx, async () => {
        return { data: 'response' }
      })
      span.end()
    })

    assert.deepEqual(result, { data: 'response' })
  })

  test('disables user context when userContext is false', async ({ assert }) => {
    const middleware = new OtelMiddleware({ userContext: false })
    const ctx = createMockContext({
      route: { pattern: '/profile' },
      auth: {
        user: { id: 42, email: 'user@example.com' },
      },
    })
    const tracer = trace.getTracer('test')

    await tracer.startActiveSpan('http-request', async (span) => {
      await middleware.handle(ctx, async () => {})
      span.end()
    })

    const spans = getFinishedSpans()
    assert.lengthOf(spans, 1)
    assert.isUndefined(spans[0].attributes['user.id'])
  })

  test('disables user context when enabled is false', async ({ assert }) => {
    const middleware = new OtelMiddleware({ userContext: { enabled: false } })
    const ctx = createMockContext({
      route: { pattern: '/profile' },
      auth: {
        user: { id: 42, email: 'user@example.com' },
      },
    })
    const tracer = trace.getTracer('test')

    await tracer.startActiveSpan('http-request', async (span) => {
      await middleware.handle(ctx, async () => {})
      span.end()
    })

    const spans = getFinishedSpans()
    assert.lengthOf(spans, 1)
    assert.isUndefined(spans[0].attributes['user.id'])
  })

  test('resolver returning null skips user context', async ({ assert }) => {
    const middleware = new OtelMiddleware({
      userContext: {
        resolver: () => null,
      },
    })
    const ctx = createMockContext({
      route: { pattern: '/profile' },
      auth: {
        user: { id: 42 },
      },
    })
    const tracer = trace.getTracer('test')

    await tracer.startActiveSpan('http-request', async (span) => {
      await middleware.handle(ctx, async () => {})
      span.end()
    })

    const spans = getFinishedSpans()
    assert.lengthOf(spans, 1)
    assert.isUndefined(spans[0].attributes['user.id'])
  })

  test('resolver can add custom attributes', async ({ assert }) => {
    const middleware = new OtelMiddleware({
      userContext: {
        resolver: (ctx) => {
          const user = ctx.auth?.user as Record<string, unknown>
          if (!user) return null
          return {
            id: user.id as number,
            tenantId: user.tenantId as string,
            plan: user.plan as string,
          }
        },
      },
    })
    const ctx = createMockContext({
      route: { pattern: '/profile' },
      auth: {
        user: { id: 42, tenantId: 'tenant-123', plan: 'enterprise' },
      },
    })
    const tracer = trace.getTracer('test')

    await tracer.startActiveSpan('http-request', async (span) => {
      await middleware.handle(ctx, async () => {})
      span.end()
    })

    const spans = getFinishedSpans()
    assert.lengthOf(spans, 1)
    assert.equal(spans[0].attributes['user.id'], '42')
    assert.equal(spans[0].attributes['user.tenantId'], 'tenant-123')
    assert.equal(spans[0].attributes['user.plan'], 'enterprise')
  })
})

/**
 * Minimal HttpContext mock for testing middleware
 */
function createMockContext(
  overrides: {
    route?: { pattern?: string; name?: string }
    method?: string
    responseStatus?: number
    auth?: { user?: Record<string, unknown> }
  } = {}
) {
  return {
    request: { method: () => overrides.method ?? 'GET' },
    route: overrides.route ?? null,
    response: { getStatus: () => overrides.responseStatus ?? 200 },
    auth: overrides.auth,
  } as any
}
