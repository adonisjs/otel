import { context, Span, trace } from '@opentelemetry/api'
import { getRPCMetadata, RPCType } from '@opentelemetry/core'
import {
  ATTR_HTTP_RESPONSE_STATUS_CODE,
  ATTR_HTTP_ROUTE,
} from '@opentelemetry/semantic-conventions'
import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'
import { setUser } from '../helpers.js'
import type { UserContextConfig } from '../types/index.js'
// No idea why <reference types> is not working on this codebase. So using
// import type for now
import type {} from '@adonisjs/auth/initialize_auth_middleware'

/**
 * Enriches the active OpenTelemetry span with AdonisJS-specific attributes.
 *
 * Should be registered as a router middleware so it runs after route resolution.
 * Automatically extracts user context from Auth module when available.
 */
export default class OtelMiddleware {
  #userContextConfig: UserContextConfig | false

  constructor(options: { userContext?: UserContextConfig | false }) {
    this.#userContextConfig = options.userContext ?? {}
  }

  /**
   * Extracts user from auth context and sets OTEL user attributes.
   * Supports custom resolvers or defaults to ctx.auth.user fields.
   */
  async #setUserFromAuth(ctx: HttpContext): Promise<void> {
    if (this.#userContextConfig === false) return
    if (this.#userContextConfig.enabled === false) return

    if (this.#userContextConfig.resolver) {
      const resolved = await this.#userContextConfig.resolver(ctx)
      if (resolved) setUser(resolved)
      return
    }

    const user = ctx.auth?.user as Record<string, any> | undefined
    if (!user) return

    setUser({ id: user.id, email: user.email, role: user.role })
  }

  /**
   * Sets route metadata via RPCMetadata for OTEL HTTP instrumentation.
   * This is the standard mechanism OTEL uses to populate http.route attribute.
   */
  #setRouteViaRpcMetadata(routePattern: string): void {
    const rpcMetadata = getRPCMetadata(context.active())
    if (rpcMetadata?.type === RPCType.HTTP) rpcMetadata.route = routePattern
  }

  /**
   * Updates span name and sets http.route attribute directly.
   * Produces better trace names like "GET /users/:id" instead of just "GET".
   */
  #updateSpanWithRoute(options: { span: Span; method: string; routePattern: string }): void {
    options.span?.updateName(`${options.method} ${options.routePattern}`)
    options.span?.setAttribute(ATTR_HTTP_ROUTE, options.routePattern)
  }

  /**
   * Enriches active span with route info, user context, and response status.
   */
  async handle(ctx: HttpContext, next: NextFn) {
    const span = trace.getActiveSpan()
    if (!span) return next()

    const { request, route } = ctx

    if (route?.pattern) {
      this.#setRouteViaRpcMetadata(route.pattern)
      this.#updateSpanWithRoute({ span, method: request.method(), routePattern: route.pattern })
    }

    span.setAttributes({ 'adonis.route.name': route?.name ?? 'unknown' })

    await this.#setUserFromAuth(ctx)

    const output = await next()
    span.setAttribute(ATTR_HTTP_RESPONSE_STATUS_CODE, ctx.response.getStatus())

    return output
  }
}
