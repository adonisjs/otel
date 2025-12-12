import { test } from '@japa/runner'
import { trace } from '@opentelemetry/api'
import { setupTracing, resetSpans, getFinishedSpans } from './helpers/setup_tracing.js'
import { TestableContainerInstrumentation } from './helpers/testable_instrumentations.js'

test.group('ContainerInstrumentation', (group) => {
  group.setup(() => {
    setupTracing()
  })

  group.each.setup(() => {
    resetSpans()
  })

  test('enable() subscribes to tracingChannels.containerMake', ({ assert }) => {
    const instrumentation = new TestableContainerInstrumentation()
    instrumentation.enable()

    assert.isTrue(instrumentation.testSubscribed)
    assert.isDefined(instrumentation.testHandlers)

    instrumentation.disable()
  })

  test('enable() is idempotent - calling twice does not double subscribe', ({ assert }) => {
    const instrumentation = new TestableContainerInstrumentation()

    instrumentation.enable()
    const firstHandlers = instrumentation.testHandlers

    instrumentation.enable()
    const secondHandlers = instrumentation.testHandlers

    // Handlers should be the exact same reference (not recreated)
    assert.strictEqual(firstHandlers, secondHandlers)

    instrumentation.disable()
  })

  test('disable() unsubscribes and cleans up', ({ assert }) => {
    const instrumentation = new TestableContainerInstrumentation()

    instrumentation.enable()
    assert.isTrue(instrumentation.testSubscribed)
    assert.isDefined(instrumentation.testHandlers)

    instrumentation.disable()
    assert.isFalse(instrumentation.testSubscribed)
    assert.isUndefined(instrumentation.testHandlers)
  })

  test('disable() is idempotent', ({ assert }) => {
    const instrumentation = new TestableContainerInstrumentation()

    instrumentation.enable()
    instrumentation.disable()
    instrumentation.disable()

    assert.isFalse(instrumentation.testSubscribed)
  })

  test('handleStart creates span when there is a parent context', ({ assert }) => {
    const instrumentation = new TestableContainerInstrumentation()
    const tracer = trace.getTracer('test')

    tracer.startActiveSpan('parent-span', (parentSpan) => {
      const message = { binding: class TestService {} }
      instrumentation.testHandleStart(message)

      const span = instrumentation.testSpans.get(message)
      assert.isDefined(span)

      span!.end()
      parentSpan.end()
    })

    const spans = getFinishedSpans()
    assert.lengthOf(spans, 2)

    const containerSpan = spans.find((s) => s.name === 'container.make TestService')
    assert.isDefined(containerSpan)
    assert.equal(containerSpan!.attributes['container.binding'], 'TestService')
  })

  test('handleStart does NOT create span when there is no parent context', ({ assert }) => {
    const instrumentation = new TestableContainerInstrumentation()
    const message = { binding: class TestService {} }

    instrumentation.testHandleStart(message)

    const span = instrumentation.testSpans.get(message)
    assert.isUndefined(span)
  })

  test('handleAsyncEnd ends the span and removes it from WeakMap', ({ assert }) => {
    const instrumentation = new TestableContainerInstrumentation()
    const tracer = trace.getTracer('test')

    tracer.startActiveSpan('parent-span', (parentSpan) => {
      const message = { binding: class TestService {} }
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
    const instrumentation = new TestableContainerInstrumentation()
    const tracer = trace.getTracer('test')

    tracer.startActiveSpan('parent-span', (parentSpan) => {
      const message = { binding: class TestService {}, error: new Error('Test error') }
      instrumentation.testHandleStart(message)
      instrumentation.testHandleError(message)

      parentSpan.end()
    })

    const spans = getFinishedSpans()
    const containerSpan = spans.find((s) => s.name === 'container.make TestService')

    assert.isDefined(containerSpan)
    assert.equal(containerSpan!.status.code, 2) // SpanStatusCode.ERROR
    assert.equal(containerSpan!.status.message, 'Test error')
    assert.isNotEmpty(containerSpan!.events) // exception event
  })

  test('getBindingName extracts name from class', ({ assert }) => {
    const instrumentation = new TestableContainerInstrumentation()

    class MyService {}
    const name = instrumentation.testGetBindingName(MyService)
    assert.equal(name, 'MyService')
  })

  test('getBindingName handles string binding', ({ assert }) => {
    const instrumentation = new TestableContainerInstrumentation()
    const name = instrumentation.testGetBindingName('my.service')
    assert.equal(name, 'my.service')
  })

  test('getBindingName handles symbol binding', ({ assert }) => {
    const instrumentation = new TestableContainerInstrumentation()
    const sym = Symbol('mySymbol')
    const name = instrumentation.testGetBindingName(sym)
    assert.equal(name, 'mySymbol')
  })

  test('getBindingName handles symbol without description', ({ assert }) => {
    const instrumentation = new TestableContainerInstrumentation()
    const sym = Symbol()
    const name = instrumentation.testGetBindingName(sym)
    assert.equal(name, 'symbol')
  })

  test('getBindingName handles anonymous function', ({ assert }) => {
    const instrumentation = new TestableContainerInstrumentation()
    const name = instrumentation.testGetBindingName(() => {})
    assert.equal(name, 'anonymous')
  })

  test('getBindingName returns "unknown" for unrecognized types', ({ assert }) => {
    const instrumentation = new TestableContainerInstrumentation()

    assert.equal(instrumentation.testGetBindingName(12345), 'unknown')
    assert.equal(instrumentation.testGetBindingName(null), 'unknown')
    assert.equal(instrumentation.testGetBindingName(undefined), 'unknown')
    assert.equal(instrumentation.testGetBindingName({ foo: 'bar' }), 'unknown')
  })

  test('can re-enable after disable', ({ assert }) => {
    const instrumentation = new TestableContainerInstrumentation()

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
