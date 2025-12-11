import { test } from '@japa/runner'
import { SpanStatusCode, trace, context } from '@opentelemetry/api'
import { setupTracing, resetSpans, getFinishedSpans } from './helpers/setup_tracing.js'
import {
  getCurrentSpan,
  setAttributes,
  record,
  handleError,
  setUser,
  recordEvent,
  injectTraceContext,
  extractTraceContext,
} from '../src/helpers.js'

test.group('Helpers', (group) => {
  group.setup(() => {
    setupTracing()
  })

  group.each.setup(() => {
    resetSpans()
  })

  test('getCurrentSpan returns undefined when no active span', ({ assert }) => {
    const span = getCurrentSpan()
    assert.isUndefined(span)
  })

  test('getCurrentSpan returns the active span', ({ assert }) => {
    const tracer = trace.getTracer('test')
    tracer.startActiveSpan('test-span', (span) => {
      const activeSpan = getCurrentSpan()
      assert.isDefined(activeSpan)
      assert.equal(activeSpan, span)
      span.end()
    })
  })

  test('setAttributes does nothing when no active span', ({ assert }) => {
    assert.doesNotThrow(() => {
      setAttributes({ 'test.attribute': 'value' })
    })
  })

  test('setAttributes sets attributes on active span', ({ assert }) => {
    const tracer = trace.getTracer('test')
    tracer.startActiveSpan('test-span', (span) => {
      setAttributes({ 'custom.attribute': 'test-value', 'another.attr': 42 })
      span.end()
    })

    const spans = getFinishedSpans()
    assert.lengthOf(spans, 1)
    assert.deepInclude(spans[0].attributes, {
      'custom.attribute': 'test-value',
      'another.attr': 42,
    })
  })

  test('record creates a span with the given name', ({ assert }) => {
    record('my-operation', () => {
      return 'result'
    })

    const spans = getFinishedSpans()
    assert.lengthOf(spans, 1)
    assert.equal(spans[0].name, 'my-operation')
  })

  test('record returns the callback result for sync functions', ({ assert }) => {
    const result = record('sync-op', () => {
      return 42
    })

    assert.equal(result, 42)
  })

  test('record returns the callback result for async functions', async ({ assert }) => {
    const result = await record('async-op', async () => {
      return Promise.resolve('async-result')
    })

    assert.equal(result, 'async-result')
  })

  test('record passes the span to the callback', ({ assert }) => {
    record('span-callback', (span) => {
      assert.isDefined(span)
      span.setAttributes({ 'callback.attribute': 'from-callback' })
    })

    const spans = getFinishedSpans()
    assert.lengthOf(spans, 1)
    assert.deepInclude(spans[0].attributes, {
      'callback.attribute': 'from-callback',
    })
  })

  test('record handles sync errors and sets error status', ({ assert }) => {
    assert.throws(() => {
      record('error-op', () => {
        throw new Error('sync error')
      })
    }, 'sync error')

    const spans = getFinishedSpans()
    assert.lengthOf(spans, 1)
    assert.equal(spans[0].status.code, SpanStatusCode.ERROR)
    assert.equal(spans[0].status.message, 'sync error')
    assert.isNotEmpty(spans[0].events)
  })

  test('record handles async errors and sets error status', async ({ assert }) => {
    await assert.rejects(async () => {
      await record('async-error-op', async () => {
        throw new Error('async error')
      })
    }, 'async error')

    const spans = getFinishedSpans()
    assert.lengthOf(spans, 1)
    assert.equal(spans[0].status.code, SpanStatusCode.ERROR)
    assert.equal(spans[0].status.message, 'async error')
  })

  test('record properly ends span after sync success', ({ assert }) => {
    record('sync-success', () => 'done')

    const spans = getFinishedSpans()
    assert.lengthOf(spans, 1)
    assert.isDefined(spans[0].endTime)
  })

  test('record properly ends span after async success', async ({ assert }) => {
    await record('async-success', async () => 'done')

    const spans = getFinishedSpans()
    assert.lengthOf(spans, 1)
    assert.isDefined(spans[0].endTime)
  })

  test('handleError records exception and rethrows', ({ assert }) => {
    const tracer = trace.getTracer('test')
    const error = new Error('handled error')

    tracer.startActiveSpan('error-span', (span) => {
      assert.throws(() => {
        handleError(span, error)
      }, 'handled error')
    })

    const spans = getFinishedSpans()
    assert.lengthOf(spans, 1)
    assert.equal(spans[0].status.code, SpanStatusCode.ERROR)
    assert.equal(spans[0].status.message, 'handled error')
  })

  test('setUser sets user attributes on active span', ({ assert }) => {
    const tracer = trace.getTracer('test')
    tracer.startActiveSpan('user-span', (span) => {
      setUser({ id: 123, email: 'test@example.com', role: 'admin' })
      span.end()
    })

    const spans = getFinishedSpans()
    assert.lengthOf(spans, 1)
    assert.deepInclude(spans[0].attributes, {
      'user.id': '123',
      'user.email': 'test@example.com',
      'user.roles': ['admin'],
    })
  })

  test('setUser sets only id when email and role not provided', ({ assert }) => {
    const tracer = trace.getTracer('test')
    tracer.startActiveSpan('user-span', (span) => {
      setUser({ id: 'user-456' })
      span.end()
    })

    const spans = getFinishedSpans()
    assert.lengthOf(spans, 1)
    assert.equal(spans[0].attributes['user.id'], 'user-456')
    assert.isUndefined(spans[0].attributes['user.email'])
    assert.isUndefined(spans[0].attributes['user.roles'])
  })

  test('setUser adds extra custom attributes', ({ assert }) => {
    const tracer = trace.getTracer('test')
    tracer.startActiveSpan('user-span', (span) => {
      setUser({ id: 1, tenant: 'acme', plan: 'pro' })
      span.end()
    })

    const spans = getFinishedSpans()
    assert.lengthOf(spans, 1)
    assert.equal(spans[0].attributes['user.tenant'], 'acme')
    assert.equal(spans[0].attributes['user.plan'], 'pro')
  })

  test('setUser does nothing when no active span', ({ assert }) => {
    assert.doesNotThrow(() => {
      setUser({ id: 123 })
    })
  })

  test('recordEvent adds event to active span', ({ assert }) => {
    const tracer = trace.getTracer('test')
    tracer.startActiveSpan('event-span', (span) => {
      recordEvent('cache.miss')
      span.end()
    })

    const spans = getFinishedSpans()
    assert.lengthOf(spans, 1)
    assert.isNotEmpty(spans[0].events)
    assert.equal(spans[0].events[0].name, 'cache.miss')
  })

  test('recordEvent adds event with attributes', ({ assert }) => {
    const tracer = trace.getTracer('test')
    tracer.startActiveSpan('event-span', (span) => {
      recordEvent('order.processed', { 'order.id': 'ord-123', 'order.total': 99.99 })
      span.end()
    })

    const spans = getFinishedSpans()
    assert.lengthOf(spans, 1)
    assert.equal(spans[0].events[0].name, 'order.processed')
    assert.deepInclude(spans[0].events[0].attributes, {
      'order.id': 'ord-123',
      'order.total': 99.99,
    })
  })

  test('recordEvent does nothing when no active span', ({ assert }) => {
    assert.doesNotThrow(() => {
      recordEvent('some.event')
    })
  })

  test('injectTraceContext injects trace headers', ({ assert }) => {
    const tracer = trace.getTracer('test')
    tracer.startActiveSpan('inject-span', (span) => {
      const headers: Record<string, string> = {}
      injectTraceContext(headers)

      // W3C trace context headers should be set
      assert.isDefined(headers['traceparent'])
      assert.match(headers['traceparent'], /^00-[a-f0-9]{32}-[a-f0-9]{16}-0[01]$/)

      span.end()
    })
  })

  test('extractTraceContext and context propagation work together', ({ assert }) => {
    const tracer = trace.getTracer('test')

    // Start a span and inject its context
    let injectedHeaders: Record<string, string> = {}
    tracer.startActiveSpan('parent-span', (parentSpan) => {
      injectTraceContext(injectedHeaders)
      parentSpan.end()
    })

    resetSpans()

    // Extract context and create a child span
    const extractedContext = extractTraceContext(injectedHeaders)
    context.with(extractedContext, () => {
      tracer.startActiveSpan('child-span', (childSpan) => {
        childSpan.end()
      })
    })

    const spans = getFinishedSpans()
    assert.lengthOf(spans, 1)
    assert.equal(spans[0].name, 'child-span')

    // The child span should have the parent's trace ID
    const traceIdFromHeader = injectedHeaders['traceparent'].split('-')[1]
    assert.equal(spans[0].spanContext().traceId, traceIdFromHeader)
  })
})
