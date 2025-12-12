import { ContainerInstrumentation } from '../../src/instrumentations/container.js'
import { EventsInstrumentation } from '../../src/instrumentations/events.js'

/**
 * Testable version of ContainerInstrumentation that exposes protected members
 */
export class TestableContainerInstrumentation extends ContainerInstrumentation {
  get testSpans() {
    return this.spans
  }

  get testSubscribed() {
    return this.subscribed
  }

  get testHandlers() {
    return this.handlers
  }

  testHandleStart(message: any) {
    return this.handleStart(message)
  }

  testHandleAsyncEnd(message: any) {
    return this.handleAsyncEnd(message)
  }

  testHandleError(message: any) {
    return this.handleError(message)
  }

  testGetBindingName(binding: unknown) {
    return this.getBindingName(binding)
  }
}

/**
 * Testable version of EventsInstrumentation that exposes protected members
 */
export class TestableEventsInstrumentation extends EventsInstrumentation {
  get testSpans() {
    return this.spans
  }

  get testSubscribed() {
    return this.subscribed
  }

  get testHandlers() {
    return this.handlers
  }

  testHandleStart(message: any) {
    return this.handleStart(message)
  }

  testHandleAsyncEnd(message: any) {
    return this.handleAsyncEnd(message)
  }

  testHandleError(message: any) {
    return this.handleError(message)
  }

  testGetEventName(event: unknown) {
    return this.getEventName(event)
  }
}
