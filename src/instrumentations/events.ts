import type { Span } from '@opentelemetry/api'
import type { InstrumentationConfig } from '@opentelemetry/instrumentation'
import type { TracingChannelSubscribers } from 'node:diagnostics_channel'
import { context, SpanKind, SpanStatusCode, trace } from '@opentelemetry/api'
import { InstrumentationBase } from '@opentelemetry/instrumentation'
import { tracingChannels } from '@adonisjs/core/events'
import { type AllowedEventTypes, type EventDispatchData } from '@adonisjs/core/types/events'

/**
 * OpenTelemetry instrumentation for AdonisJS Event Emitter.
 *
 * Creates spans for `emitter.emit()` calls, tracking event dispatch and listeners execution.
 * Spans are only created when there is an active parent context to avoid
 * orphan traces during application boot.
 *
 * Span name: `event.dispatch {eventName}`
 * Attributes: `event.name`
 */
export class EventsInstrumentation extends InstrumentationBase {
  protected subscribed = false
  protected spans = new WeakMap<object, Span>()
  protected handlers?: TracingChannelSubscribers<EventDispatchData>

  constructor(config: InstrumentationConfig = {}) {
    super('@adonisjs/instrumentation-events', '1.0.0', config)
  }

  /**
   * Required by InstrumentationBase. Returns undefined since we use
   * diagnostics_channel instead of module patching.
   */
  protected init() {
    return undefined
  }

  /**
   * Extracts a human-readable name from an event.
   */
  protected getEventName(event: AllowedEventTypes): string {
    if (typeof event === 'string') return event
    if (typeof event === 'symbol') return event.description || 'symbol'
    if (typeof event === 'number') return String(event)
    if (typeof event === 'function') return event.name || 'anonymous'
    return 'unknown'
  }

  /**
   * Called when emitter.emit() starts. Creates a new span if there's a parent context.
   */
  protected handleStart(message: EventDispatchData) {
    const parentContext = context.active()
    if (!trace.getSpan(parentContext)) return

    const eventName = this.getEventName(message.event)
    const span = this.tracer.startSpan(
      `event.dispatch ${eventName}`,
      { kind: SpanKind.INTERNAL, attributes: { 'event.name': eventName } },
      parentContext
    )
    this.spans.set(message, span)
  }

  /**
   * Called when emitter.emit() completes successfully. Ends the span.
   */
  protected handleAsyncEnd(message: EventDispatchData) {
    const span = this.spans.get(message)
    if (!span) return

    span.end()
    this.spans.delete(message)
  }

  /**
   * Called when a listener throws. Records the exception and ends the span.
   */
  protected handleError(message: EventDispatchData & { error: unknown }) {
    const span = this.spans.get(message)
    if (!span) return

    if (message.error instanceof Error) {
      span.recordException(message.error)
      span.setStatus({ code: SpanStatusCode.ERROR, message: message.error.message })
    }

    span.end()
    this.spans.delete(message)
  }

  /**
   * Subscribes to the events tracing channel.
   */
  enable() {
    if (this.subscribed) return
    this.subscribed = true

    this.handlers = {
      start: (message) => this.handleStart(message),
      end: () => {},
      asyncStart: () => {},
      asyncEnd: (message) => this.handleAsyncEnd(message),
      error: (message) => this.handleError(message),
    }

    tracingChannels.eventDispatch.subscribe(this.handlers)
  }

  /**
   * Unsubscribes from the events tracing channel and cleans up.
   */
  disable() {
    if (!this.subscribed || !this.handlers) return

    tracingChannels.eventDispatch.unsubscribe(this.handlers)

    this.subscribed = false
    this.handlers = undefined
    this.spans = new WeakMap()
  }
}
