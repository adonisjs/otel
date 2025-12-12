import { test } from '@japa/runner'
import { trace } from '@opentelemetry/api'
import { setupTracing, resetSpans, getFinishedSpans } from './helpers/setup_tracing.js'
import { TestableEventsInstrumentation } from './helpers/testable_instrumentations.js'

test.group('EventsInstrumentation', (group) => {
  group.setup(() => {
    setupTracing()
  })

  group.each.setup(() => {
    resetSpans()
  })

  test('enable() subscribes to tracingChannels.eventDispatch', ({ assert }) => {
    const instrumentation = new TestableEventsInstrumentation()
    instrumentation.enable()

    assert.isTrue(instrumentation.testSubscribed)
    assert.isDefined(instrumentation.testHandlers)

    instrumentation.disable()
  })

  test('enable() is idempotent - calling twice does not double subscribe', ({ assert }) => {
    const instrumentation = new TestableEventsInstrumentation()

    instrumentation.enable()
    const firstHandlers = instrumentation.testHandlers

    instrumentation.enable()
    const secondHandlers = instrumentation.testHandlers

    // Handlers should be the exact same reference (not recreated)
    assert.strictEqual(firstHandlers, secondHandlers)

    instrumentation.disable()
  })

  test('disable() unsubscribes and cleans up', ({ assert }) => {
    const instrumentation = new TestableEventsInstrumentation()

    instrumentation.enable()
    assert.isTrue(instrumentation.testSubscribed)
    assert.isDefined(instrumentation.testHandlers)

    instrumentation.disable()
    assert.isFalse(instrumentation.testSubscribed)
    assert.isUndefined(instrumentation.testHandlers)
  })

  test('disable() is idempotent', ({ assert }) => {
    const instrumentation = new TestableEventsInstrumentation()

    instrumentation.enable()
    instrumentation.disable()
    instrumentation.disable()

    assert.isFalse(instrumentation.testSubscribed)
  })

  test('handleStart creates span when there is a parent context', ({ assert }) => {
    const instrumentation = new TestableEventsInstrumentation()
    const tracer = trace.getTracer('test')

    tracer.startActiveSpan('parent-span', (parentSpan) => {
      class OrderCreated {}
      const message = { event: OrderCreated, data: { orderId: '123' } }
      instrumentation.testHandleStart(message)

      const span = instrumentation.testSpans.get(message)
      assert.isDefined(span)

      span!.end()
      parentSpan.end()
    })

    const spans = getFinishedSpans()
    assert.lengthOf(spans, 2)

    const eventSpan = spans.find((s) => s.name === 'event.dispatch OrderCreated')
    assert.isDefined(eventSpan)
    assert.equal(eventSpan!.attributes['event.name'], 'OrderCreated')
  })

  test('handleStart does NOT create span when there is no parent context', ({ assert }) => {
    const instrumentation = new TestableEventsInstrumentation()
    class OrderCreated {}
    const message = { event: OrderCreated, data: {} }

    instrumentation.testHandleStart(message)

    const span = instrumentation.testSpans.get(message)
    assert.isUndefined(span)
  })

  test('handleAsyncEnd ends the span and removes it from WeakMap', ({ assert }) => {
    const instrumentation = new TestableEventsInstrumentation()
    const tracer = trace.getTracer('test')

    tracer.startActiveSpan('parent-span', (parentSpan) => {
      class OrderCreated {}
      const message = { event: OrderCreated, data: {} }
      instrumentation.testHandleStart(message)

      const span = instrumentation.testSpans.get(message)
      assert.isDefined(span)

      instrumentation.testHandleAsyncEnd(message)

      const spanAfter = instrumentation.testSpans.get(message)
      assert.isUndefined(spanAfter)

      parentSpan.end()
    })

    const spans = getFinishedSpans()
    assert.lengthOf(spans, 2)
  })

  test('handleError records exception, sets error status, and ends span', ({ assert }) => {
    const instrumentation = new TestableEventsInstrumentation()
    const tracer = trace.getTracer('test')

    tracer.startActiveSpan('parent-span', (parentSpan) => {
      class OrderCreated {}
      const message = { event: OrderCreated, data: {}, error: new Error('Event handler failed') }
      instrumentation.testHandleStart(message)
      instrumentation.testHandleError(message)

      parentSpan.end()
    })

    const spans = getFinishedSpans()
    const eventSpan = spans.find((s) => s.name === 'event.dispatch OrderCreated')

    assert.isDefined(eventSpan)
    assert.equal(eventSpan!.status.code, 2) // SpanStatusCode.ERROR
    assert.equal(eventSpan!.status.message, 'Event handler failed')
    assert.isNotEmpty(eventSpan!.events) // exception event
  })

  test('getEventName extracts name from class', ({ assert }) => {
    const instrumentation = new TestableEventsInstrumentation()

    class OrderCreated {}
    const name = instrumentation.testGetEventName(OrderCreated)
    assert.equal(name, 'OrderCreated')
  })

  test('getEventName handles string event', ({ assert }) => {
    const instrumentation = new TestableEventsInstrumentation()
    const name = instrumentation.testGetEventName('order:created')
    assert.equal(name, 'order:created')
  })

  test('getEventName handles symbol event', ({ assert }) => {
    const instrumentation = new TestableEventsInstrumentation()
    const sym = Symbol('orderEvent')
    const name = instrumentation.testGetEventName(sym)
    assert.equal(name, 'orderEvent')
  })

  test('getEventName handles symbol without description', ({ assert }) => {
    const instrumentation = new TestableEventsInstrumentation()
    const sym = Symbol()
    const name = instrumentation.testGetEventName(sym)
    assert.equal(name, 'symbol')
  })

  test('getEventName handles number event', ({ assert }) => {
    const instrumentation = new TestableEventsInstrumentation()
    const name = instrumentation.testGetEventName(42)
    assert.equal(name, '42')
  })

  test('getEventName handles anonymous function', ({ assert }) => {
    const instrumentation = new TestableEventsInstrumentation()
    const name = instrumentation.testGetEventName(() => {})
    assert.equal(name, 'anonymous')
  })

  test('getEventName returns "unknown" for unrecognized types', ({ assert }) => {
    const instrumentation = new TestableEventsInstrumentation()

    assert.equal(instrumentation.testGetEventName({ custom: 'object' }), 'unknown')
    assert.equal(instrumentation.testGetEventName(null), 'unknown')
    assert.equal(instrumentation.testGetEventName(undefined), 'unknown')
    assert.equal(instrumentation.testGetEventName([1, 2, 3]), 'unknown')
  })

  test('can re-enable after disable', ({ assert }) => {
    const instrumentation = new TestableEventsInstrumentation()

    instrumentation.enable()
    const firstHandlers = instrumentation.testHandlers
    instrumentation.disable()

    instrumentation.enable()
    const secondHandlers = instrumentation.testHandlers

    // New handlers should be created after re-enable
    assert.notStrictEqual(firstHandlers, secondHandlers)
    assert.isTrue(instrumentation.testSubscribed)

    instrumentation.disable()
  })
})
