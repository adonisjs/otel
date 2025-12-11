import { trace } from '@opentelemetry/api'
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
 * Middleware that enriches the active OpenTelemetry span with AdonisJS
 * specific attributes like the route pattern, user info, etc.
 *
 * This should be registered as a router middleware to run after the
 * route has been resolved.
 *
 * When Auth module is installed, it will automatically set user
 * attributes on the span if a user is authenticated.
 */
export default class OtelMiddleware {
  #userContextConfig: UserContextConfig | false

  constructor(options: { userContext?: UserContextConfig | false }) {
    this.#userContextConfig = options.userContext ?? {}
  }

  /**
   * Try to extract user from auth and set on span
   *
   * @see https://opentelemetry.io/docs/specs/semconv/registry/attributes/user/
   */
  async #setUserFromAuth(ctx: HttpContext): Promise<void> {
    if (this.#userContextConfig === false) return
    if (this.#userContextConfig.enabled === false) return

    // Custom resolver takes precedence
    if (this.#userContextConfig.resolver) {
      const resolved = await this.#userContextConfig.resolver(ctx)
      if (resolved) setUser(resolved)
      return
    }

    // Default: extract from ctx.auth.user
    const user = ctx.auth?.user as Record<string, any> | undefined
    if (!user) return

    setUser({ id: user.id, email: user.email, role: user.role })
  }

  async handle(ctx: HttpContext, next: NextFn) {
    const span = trace.getActiveSpan()
    if (!span) return next()

    const { request, route } = ctx

    /**
     * Update span name with HTTP method and route pattern
     * This gives much better trace names like "GET /users/:id" instead of "GET"
     */
    if (route?.pattern) {
      span.updateName(`${request.method()} ${route.pattern}`)
      span.setAttribute(ATTR_HTTP_ROUTE, route.pattern)
    }

    span.setAttributes({ 'adonis.route.name': route?.name ?? 'unknown' })

    /**
     * Automatically set user context from Auth module
     */
    await this.#setUserFromAuth(ctx)

    const output = await next()
    span.setAttribute(ATTR_HTTP_RESPONSE_STATUS_CODE, ctx.response.getStatus())
    return output
  }
}
