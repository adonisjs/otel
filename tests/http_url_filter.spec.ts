import { test } from '@japa/runner'
import { HttpUrlFilter } from '../src/http_url_filter.js'

test.group('HttpUrlFilter', () => {
  test('ignores static files and health endpoints by default', ({ assert }) => {
    const filter = new HttpUrlFilter()

    assert.isTrue(filter.shouldIgnore('/health'))
    assert.isTrue(filter.shouldIgnore('/assets/app.js'))
    assert.isFalse(filter.shouldIgnore('/api/users'))
    assert.isFalse(filter.shouldIgnore('/api/users.json'))
  })

  test('does not match partial path segments', ({ assert }) => {
    const filter = new HttpUrlFilter()

    assert.isTrue(filter.shouldIgnore('/health'))
    assert.isTrue(filter.shouldIgnore('/health/check'))
    assert.isFalse(filter.shouldIgnore('/healthcare'))
  })

  test('can disable static files filtering', ({ assert }) => {
    const filter = new HttpUrlFilter({ ignoreStaticFiles: false })

    assert.isFalse(filter.shouldIgnore('/assets/app.js'))
    assert.isTrue(filter.shouldIgnore('/health'))
  })

  test('supports prefix patterns and custom URLs', ({ assert }) => {
    const filter = new HttpUrlFilter({ ignoredUrls: ['/internal/*'] })

    assert.isTrue(filter.shouldIgnore('/internal/status'))
    assert.isTrue(filter.shouldIgnore('/health'))
    assert.isFalse(filter.shouldIgnore('/api/internal'))
  })

  test('can replace defaults with mergeIgnoredUrls false', ({ assert }) => {
    const filter = new HttpUrlFilter({
      ignoredUrls: ['/custom'],
      mergeIgnoredUrls: false,
    })

    assert.isFalse(filter.shouldIgnore('/health'))
    assert.isTrue(filter.shouldIgnore('/custom'))
  })
})
