import type { Span } from '@opentelemetry/api'
import type { InstrumentationConfig } from '@opentelemetry/instrumentation'
import type { ContainerMakeTracingData } from '@adonisjs/core/types/container'
import { context, SpanKind, SpanStatusCode, trace } from '@opentelemetry/api'
import { InstrumentationBase } from '@opentelemetry/instrumentation'
import { tracingChannels } from '@adonisjs/core/container'
import { type TracingChannelSubscribers } from 'node:diagnostics_channel'

/**
 * OpenTelemetry instrumentation for AdonisJS IoC Container.
 *
 * Creates spans for `container.make()` calls, tracking dependency resolution.
 * Spans are only created when there is an active parent context to avoid
 * orphan traces during application boot.
 *
 * Span name: `container.make {bindingName}`
 * Attributes: `container.binding`
 */
export class ContainerInstrumentation extends InstrumentationBase {
  protected subscribed = false
  protected spans = new WeakMap<object, Span>()
  protected handlers?: TracingChannelSubscribers<ContainerMakeTracingData>

  constructor(config: InstrumentationConfig = {}) {
    super('@adonisjs/instrumentation-container', '1.0.0', config)
  }

  /**
   * Required by InstrumentationBase. Returns undefined since we use
   * diagnostics_channel instead of module patching.
   */
  protected init() {
    return undefined
  }

  /**
   * Extracts a human-readable name from a container binding.
   */
  protected getBindingName(binding: unknown): string {
    if (typeof binding === 'string') return binding
    if (typeof binding === 'symbol') return binding.description || 'symbol'
    if (typeof binding === 'function') return binding.name || 'anonymous'
    return 'unknown'
  }

  /**
   * Called when container.make() starts. Creates a new span if there's a parent context.
   */
  protected handleStart(message: ContainerMakeTracingData) {
    const parentContext = context.active()
    if (!trace.getSpan(parentContext)) return

    const bindingName = this.getBindingName(message.binding)
    const span = this.tracer.startSpan(
      `container.make ${bindingName}`,
      { kind: SpanKind.INTERNAL, attributes: { 'container.binding': bindingName } },
      parentContext
    )
    this.spans.set(message, span)
  }

  /**
   * Called when container.make() completes successfully. Ends the span.
   */
  protected handleAsyncEnd(message: ContainerMakeTracingData) {
    const span = this.spans.get(message)
    if (!span) return

    span.end()
    this.spans.delete(message)
  }

  /**
   * Called when container.make() throws. Records the exception and ends the span.
   */
  protected handleError(message: ContainerMakeTracingData & { error: unknown }) {
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
   * Subscribes to the container tracing channel.
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

    tracingChannels.containerMake.subscribe(this.handlers)
  }

  /**
   * Unsubscribes from the container tracing channel and cleans up.
   */
  disable() {
    if (!this.subscribed || !this.handlers) return

    tracingChannels.containerMake.unsubscribe(this.handlers)

    this.subscribed = false
    this.handlers = undefined
    this.spans = new WeakMap()
  }
}
