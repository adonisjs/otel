import { test } from '@japa/runner'

import { destinations } from '../src/destinations.js'

test.group('destinations.otlp', () => {
  test('applies defaults when enabled/signals are undefined', ({ assert }) => {
    const config = destinations.otlp({
      endpoint: 'http://localhost:4318',
      enabled: undefined,
      signals: undefined,
    })

    assert.equal(config.enabled, true)
    assert.equal(config.signals, 'all')
  })

  test('keeps explicit enabled/signals values', ({ assert }) => {
    const config = destinations.otlp({
      endpoint: 'http://localhost:4318',
      enabled: false,
      signals: ['logs'],
    })

    assert.equal(config.enabled, false)
    assert.deepEqual(config.signals, ['logs'])
  })
})
