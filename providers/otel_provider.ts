import { SpanStatusCode } from '@opentelemetry/api'
import { configProvider } from '@adonisjs/core'
import type { ApplicationService } from '@adonisjs/core/types'
import { ExceptionHandler, type HttpContext } from '@adonisjs/core/http'

import { getCurrentSpan } from '../src/helpers.js'
import type { OtelConfig } from '../src/types/index.js'
import OtelMiddleware from '../src/middleware/otel_middleware.js'
import { OtelManager } from '../src/otel.js'

export default class OtelProvider {
  constructor(protected app: ApplicationService) {}

  /**
   * Hook into ExceptionHandler to record exceptions in spans
   */
  #registerExceptionHandler() {
    const originalReport = ExceptionHandler.prototype.report

    ExceptionHandler.macro(
      'report',
      async function (this: ExceptionHandler, error: unknown, ctx: HttpContext) {
        const span = getCurrentSpan()
        if (span && error instanceof Error) {
          span.recordException(error)
          span.setStatus({ code: SpanStatusCode.ERROR, message: error.message })
        }

        return originalReport.call(this, error, ctx)
      }
    )
  }

  register() {
    this.#registerExceptionHandler()
    this.#registerMiddleware()
  }

  /**
   * Register the OtelMiddleware as a singleton in the container
   */
  #registerMiddleware() {
    this.app.container.singleton(OtelMiddleware, async () => {
      const config = this.app.config.get<OtelConfig>('otel', {})
      return new OtelMiddleware({ userContext: config?.userContext })
    })
  }

  /**
   * Gracefully flush pending spans
   */
  async shutdown() {
    await OtelManager.getInstance()?.shutdown()
  }
}
