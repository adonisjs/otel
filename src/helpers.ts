import type { Attributes, Span } from '@opentelemetry/api'
import { context, propagation, trace, SpanStatusCode } from '@opentelemetry/api'
import {
  hiddenFields,
  type HeadersCarrier,
  type OtelLoggingPresetOptions,
  type UserContextResult,
} from './types/index.js'

/**
 * Get the currently active span from the current context.
 *
 * Returns `undefined` if there is no active span.
 *
 * @example
 * ```ts
 * import { getCurrentSpan } from '@adonisjs/otel'
 *
 * function myUtility() {
 *   const span = getCurrentSpan()
 *   span?.setAttributes({ 'custom.attribute': 'value' })
 * }
 * ```
 */
export function getCurrentSpan(): Span | undefined {
  return trace.getActiveSpan()
}

/**
 * Set attributes on the currently active span.
 *
 * This is a convenience wrapper around `getCurrentSpan()?.setAttributes()`.
 * Does nothing if there is no active span.
 *
 * @example
 * ```ts
 * import { setAttributes } from '@adonisjs/otel'
 *
 * function processOrder(orderId: string) {
 *   setAttributes({
 *     'order.id': orderId,
 *     'order.type': 'subscription',
 *   })
 * }
 * ```
 */
export function setAttributes(attributes: Attributes): void {
  getCurrentSpan()?.setAttributes(attributes)
}

/**
 * Record a code section as a span in your traces.
 *
 * Automatically handles:
 * - Creating and closing the span
 * - Capturing exceptions and setting error status
 * - Async/await support
 *
 * @example
 * ```ts
 * import { record } from '@adonisjs/otel'
 *
 * // Sync
 * const result = record('database.query', () => {
 *   return db.query('SELECT * FROM users')
 * })
 *
 * // Async
 * const user = await record('user.fetch', async () => {
 *   return await userService.findById(id)
 * })
 *
 * // With attributes
 * const order = await record('order.process', async (span) => {
 *   span.setAttributes({ 'order.id': orderId })
 *   return await processOrder(orderId)
 * })
 * ```
 */
export function record<T>(name: string, callback: (span: Span) => T): T {
  const tracer = trace.getTracer('@adonisjs/otel')

  return tracer.startActiveSpan(name, (span) => {
    try {
      const result = callback(span)
      if (result instanceof Promise) {
        return result
          .then((value) => {
            span.end()
            return value
          })
          .catch((error) => handleError(span, error)) as T
      }

      span.end()
      return result
    } catch (error) {
      handleError(span, error as Error)
      return undefined as unknown as T
    }
  })
}

export function handleError(span: Span, error: Error): void {
  span.recordException(error)
  span.setStatus({ code: SpanStatusCode.ERROR, message: error?.message })
  span.end()
  throw error
}

/**
 * User semantic convention attributes
 * @see https://opentelemetry.io/docs/specs/semconv/registry/attributes/user/
 */
const ATTR_USER_ID = 'user.id'
const ATTR_USER_EMAIL = 'user.email'
const ATTR_USER_ROLES = 'user.roles'

/**
 * Set user information on the currently active span.
 *
 * Uses OpenTelemetry semantic conventions for user attributes.
 *
 * @example
 * ```ts
 * import { setUser } from '@adonisjs/otel'
 *
 * // In a controller or middleware
 * setUser({
 *   id: auth.user.id,
 *   email: auth.user.email,
 *   role: auth.user.role,
 * })
 * ```
 */
export function setUser(user: UserContextResult): void {
  const span = getCurrentSpan()
  if (!span) return

  const attributes: Attributes = {
    [ATTR_USER_ID]: String(user.id),
  }

  if (user.email) attributes[ATTR_USER_EMAIL] = user.email
  if (user.role) attributes[ATTR_USER_ROLES] = [user.role]

  // Add any extra custom attributes
  for (const [key, value] of Object.entries(user)) {
    if (!['id', 'email', 'role'].includes(key) && value !== undefined) {
      attributes[`user.${key}`] = String(value)
    }
  }

  span.setAttributes(attributes)
}

/**
 * Inject the current trace context into headers for propagation.
 *
 * Use this when making outgoing HTTP requests, dispatching queue jobs,
 * or any cross-service communication where you want to maintain trace continuity.
 *
 * @example
 * ```ts
 * import { injectTraceContext } from '@adonisjs/otel'
 *
 * // HTTP request to another service
 * const headers = {}
 * injectTraceContext(headers)
 * await fetch('https://api.example.com', { headers })
 *
 * // Queue job dispatch
 * const jobHeaders = {}
 * injectTraceContext(jobHeaders)
 * await queue.dispatch('process-order', { orderId }, { headers: jobHeaders })
 * ```
 */
export function injectTraceContext(headers: HeadersCarrier): void {
  propagation.inject(context.active(), headers)
}

/**
 * Extract trace context from incoming headers.
 *
 * Use this in queue workers, background jobs, or any service receiving
 * requests from another traced service to continue the trace.
 *
 * @returns The extracted context that can be used with `record()` or `trace.startActiveSpan()`
 *
 * @example
 * ```ts
 * import { extractTraceContext, record } from '@adonisjs/otel'
 * import { context } from '@opentelemetry/api'
 *
 * // In a queue worker
 * const extractedContext = extractTraceContext(job.headers)
 *
 * context.with(extractedContext, () => {
 *   record('process-job', () => {
 *     // This span will be a child of the original trace
 *   })
 * })
 * ```
 */
export function extractTraceContext(headers: HeadersCarrier) {
  return propagation.extract(context.active(), headers)
}

/**
 * Record an event on the currently active span.
 *
 * Events are time-stamped annotations that can be attached to spans
 * to record discrete occurrences during a span's lifetime.
 *
 * @see https://opentelemetry.io/docs/concepts/signals/traces/#span-events
 *
 * @example
 * ```ts
 * import { recordEvent } from '@adonisjs/otel'
 *
 * // Simple event
 * recordEvent('cache.miss')
 *
 * // Event with attributes
 * recordEvent('order.processed', {
 *   'order.id': orderId,
 *   'order.total': 99.99,
 * })
 * ```
 */
export function recordEvent(name: string, attributes?: Attributes): void {
  getCurrentSpan()?.addEvent(name, attributes)
}

/**
 * Preset for pino-pretty to hide OpenTelemetry-injected fields ( in development).
 *
 * By default, hides: pid, hostname, trace_id, span_id, trace_flags, route, request_id, x-request-id
 *
 * @example
 * ```ts
 * import { otelLoggingPreset } from '@adonisjs/otel'
 *
 * // Hide all OTEL fields
 * targets.pretty(otelLoggingPreset())
 *
 * // Keep trace context visible
 * targets.pretty(otelLoggingPreset({ keep: ['trace_id', 'span_id'] }))
 * ```
 */
export function otelLoggingPreset(options?: OtelLoggingPresetOptions) {
  const keep = options?.keep ?? []
  return { ignore: hiddenFields.filter((field) => !keep.includes(field)).join(',') }
}
