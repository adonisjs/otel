import { test } from '@japa/runner'
import { HttpUrlFilter } from '../src/http_url_filter.js'

test.group('HttpUrlFilter', () => {
  test('ignores static files and health endpoints by default', ({ assert }) => {
    const filter = new HttpUrlFilter()

    assert.isTrue(filter.shouldIgnore({ url: '/health' }))
    assert.isTrue(filter.shouldIgnore({ url: '/assets/app.js' }))
    assert.isFalse(filter.shouldIgnore({ url: '/api/users' }))
    assert.isFalse(filter.shouldIgnore({ url: '/api/users.json' }))
  })

  test('does not match partial path segments', ({ assert }) => {
    const filter = new HttpUrlFilter()

    assert.isTrue(filter.shouldIgnore({ url: '/health' }))
    assert.isTrue(filter.shouldIgnore({ url: '/health/check' }))
    assert.isFalse(filter.shouldIgnore({ url: '/healthcare' }))
  })

  test('can disable static files filtering', ({ assert }) => {
    const filter = new HttpUrlFilter({ ignoreStaticFiles: false })

    assert.isFalse(filter.shouldIgnore({ url: '/assets/app.js' }))
    assert.isTrue(filter.shouldIgnore({ url: '/health' }))
  })

  test('supports prefix patterns and custom URLs', ({ assert }) => {
    const filter = new HttpUrlFilter({ ignoredUrls: ['/internal/*'] })

    assert.isTrue(filter.shouldIgnore({ url: '/internal/status' }))
    assert.isTrue(filter.shouldIgnore({ url: '/health' }))
    assert.isFalse(filter.shouldIgnore({ url: '/api/internal' }))
  })

  test('can replace defaults with mergeIgnoredUrls false', ({ assert }) => {
    const filter = new HttpUrlFilter({
      ignoredUrls: ['/custom'],
      mergeIgnoredUrls: false,
    })

    assert.isFalse(filter.shouldIgnore({ url: '/health' }))
    assert.isTrue(filter.shouldIgnore({ url: '/custom' }))
  })

  test('ignores OPTIONS requests by default', ({ assert }) => {
    const filter = new HttpUrlFilter()

    assert.isTrue(filter.shouldIgnore({ url: '/api/users', method: 'OPTIONS' }))
    assert.isFalse(filter.shouldIgnore({ url: '/api/users', method: 'GET' }))
    assert.isFalse(filter.shouldIgnore({ url: '/api/users', method: 'POST' }))
  })

  test('can disable OPTIONS requests filtering', ({ assert }) => {
    const filter = new HttpUrlFilter({ ignoreOptionsRequests: false })

    assert.isFalse(filter.shouldIgnore({ url: '/api/users', method: 'OPTIONS' }))
  })

  test('passes method to custom hook', ({ assert }) => {
    let receivedRequest: { url?: string; method?: string } | undefined

    const filter = new HttpUrlFilter({
      ignoreOptionsRequests: false,
      ignoreIncomingRequestHook: (request) => {
        receivedRequest = request
        return false
      },
    })

    filter.shouldIgnore({ url: '/api/test', method: 'PUT' })

    assert.deepEqual(receivedRequest, { url: '/api/test', method: 'PUT' })
  })
})
