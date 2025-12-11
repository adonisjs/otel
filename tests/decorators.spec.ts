import { test } from '@japa/runner'
import { SpanStatusCode } from '@opentelemetry/api'
import { setupTracing, resetSpans, getFinishedSpans } from './helpers/setup_tracing.js'
import { span, spanAll } from '../src/decorators.js'

test.group('@span', (group) => {
  group.setup(() => {
    setupTracing()
  })

  group.each.setup(() => {
    resetSpans()
  })

  test('creates span with default name ClassName.methodName', ({ assert }) => {
    class TestService {
      @span()
      doSomething() {
        return 'done'
      }
    }

    const service = new TestService()
    service.doSomething()

    const spans = getFinishedSpans()
    assert.lengthOf(spans, 1)
    assert.equal(spans[0].name, 'TestService.doSomething')
  })

  test('creates span with custom name', ({ assert }) => {
    class TestService {
      @span({ name: 'custom.operation' })
      doSomething() {
        return 'done'
      }
    }

    const service = new TestService()
    service.doSomething()

    const spans = getFinishedSpans()
    assert.lengthOf(spans, 1)
    assert.equal(spans[0].name, 'custom.operation')
  })

  test('adds custom attributes to span', ({ assert }) => {
    class TestService {
      @span({ attributes: { 'service.type': 'user', 'priority': 1 } })
      doSomething() {
        return 'done'
      }
    }

    const service = new TestService()
    service.doSomething()

    const spans = getFinishedSpans()
    assert.lengthOf(spans, 1)
    assert.deepInclude(spans[0].attributes, {
      'service.type': 'user',
      'priority': 1,
    })
  })

  test('handles sync methods', ({ assert }) => {
    class TestService {
      @span()
      syncMethod() {
        return 42
      }
    }

    const service = new TestService()
    const result = service.syncMethod()

    assert.equal(result, 42)
    const spans = getFinishedSpans()
    assert.lengthOf(spans, 1)
  })

  test('handles async methods', async ({ assert }) => {
    class TestService {
      @span()
      async asyncMethod() {
        return Promise.resolve('async-result')
      }
    }

    const service = new TestService()
    const result = await service.asyncMethod()

    assert.equal(result, 'async-result')
    const spans = getFinishedSpans()
    assert.lengthOf(spans, 1)
  })

  test('records sync errors', ({ assert }) => {
    class TestService {
      @span()
      failingMethod() {
        throw new Error('sync failure')
      }
    }

    const service = new TestService()

    assert.throws(() => service.failingMethod(), 'sync failure')

    const spans = getFinishedSpans()
    assert.lengthOf(spans, 1)
    assert.equal(spans[0].status.code, SpanStatusCode.ERROR)
    assert.equal(spans[0].status.message, 'sync failure')
  })

  test('records async errors', async ({ assert }) => {
    class TestService {
      @span()
      async failingAsyncMethod() {
        throw new Error('async failure')
      }
    }

    const service = new TestService()

    await assert.rejects(async () => service.failingAsyncMethod(), 'async failure')

    const spans = getFinishedSpans()
    assert.lengthOf(spans, 1)
    assert.equal(spans[0].status.code, SpanStatusCode.ERROR)
    assert.equal(spans[0].status.message, 'async failure')
  })

  test('preserves method arguments', ({ assert }) => {
    class TestService {
      @span()
      withArgs(a: number, b: string) {
        return `${a}-${b}`
      }
    }

    const service = new TestService()
    const result = service.withArgs(42, 'test')

    assert.equal(result, '42-test')
  })

  test('preserves this context', ({ assert }) => {
    class TestService {
      value = 'instance-value'

      @span()
      getThisValue() {
        return this.value
      }
    }

    const service = new TestService()
    const result = service.getThisValue()

    assert.equal(result, 'instance-value')
  })
})

test.group('@spanAll', (group) => {
  group.setup(() => {
    setupTracing()
  })

  group.each.setup(() => {
    resetSpans()
  })

  test('traces all methods of a class', ({ assert }) => {
    @spanAll()
    class TestService {
      methodOne() {
        return 'one'
      }

      methodTwo() {
        return 'two'
      }
    }

    const service = new TestService()
    service.methodOne()
    service.methodTwo()

    const spans = getFinishedSpans()
    assert.lengthOf(spans, 2)
    assert.equal(spans[0].name, 'TestService.methodOne')
    assert.equal(spans[1].name, 'TestService.methodTwo')
  })

  test('uses custom prefix for span names', ({ assert }) => {
    @spanAll({ prefix: 'orders' })
    class OrderService {
      create() {
        return 'created'
      }

      findById() {
        return 'found'
      }
    }

    const service = new OrderService()
    service.create()
    service.findById()

    const spans = getFinishedSpans()
    assert.lengthOf(spans, 2)
    assert.equal(spans[0].name, 'orders.create')
    assert.equal(spans[1].name, 'orders.findById')
  })

  test('adds attributes to all spans', ({ assert }) => {
    @spanAll({ attributes: { 'service.layer': 'business' } })
    class BusinessService {
      methodA() {
        return 'a'
      }

      methodB() {
        return 'b'
      }
    }

    const service = new BusinessService()
    service.methodA()
    service.methodB()

    const spans = getFinishedSpans()
    assert.lengthOf(spans, 2)
    assert.deepInclude(spans[0].attributes, { 'service.layer': 'business' })
    assert.deepInclude(spans[1].attributes, { 'service.layer': 'business' })
  })

  test('does not trace constructor', ({ assert }) => {
    @spanAll()
    class TestService {
      constructor() {
        // Should not be traced
      }

      method() {
        return 'ok'
      }
    }

    new TestService()

    const spans = getFinishedSpans()
    assert.lengthOf(spans, 0)
  })

  test('handles async methods in traced class', async ({ assert }) => {
    @spanAll()
    class AsyncService {
      async fetchData() {
        return Promise.resolve('data')
      }
    }

    const service = new AsyncService()
    const result = await service.fetchData()

    assert.equal(result, 'data')
    const spans = getFinishedSpans()
    assert.lengthOf(spans, 1)
    assert.equal(spans[0].name, 'AsyncService.fetchData')
  })

  test('records errors in traced class methods', ({ assert }) => {
    @spanAll()
    class FailingService {
      willFail() {
        throw new Error('class method failure')
      }
    }

    const service = new FailingService()

    assert.throws(() => service.willFail(), 'class method failure')

    const spans = getFinishedSpans()
    assert.lengthOf(spans, 1)
    assert.equal(spans[0].status.code, SpanStatusCode.ERROR)
  })

  test('preserves instance properties', ({ assert }) => {
    @spanAll()
    class StatefulService {
      counter = 0

      increment() {
        this.counter++
        return this.counter
      }
    }

    const service = new StatefulService()
    service.increment()
    service.increment()

    assert.equal(service.counter, 2)
  })
})
