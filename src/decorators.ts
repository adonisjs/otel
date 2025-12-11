import { record } from './helpers.js'
import type { SpanOptions } from './types/index.js'

type Constructor = new (...args: any[]) => any

/**
 * Wrap a method to create a span around its execution
 */
function wrapMethod(
  target: object,
  propertyKey: string,
  descriptor: PropertyDescriptor,
  options?: SpanOptions
): PropertyDescriptor {
  const originalMethod = descriptor.value
  const className = target.constructor.name

  descriptor.value = function (this: unknown, ...args: unknown[]) {
    const spanName = options?.name ?? `${className}.${propertyKey}`

    return record(spanName, (activeSpan) => {
      if (options?.attributes) activeSpan.setAttributes(options.attributes)
      return originalMethod.apply(this, args)
    })
  }

  return descriptor
}

/**
 * Decorator to create a span around a method.
 *
 * Automatically handles:
 * - Creating and closing the span
 * - Capturing exceptions and setting error status
 * - Async/await support
 *
 * @example
 * ```ts
 * import { span } from '@adonisjs/otel'
 *
 * class UserService {
 *   @span()
 *   async findById(id: string) {
 *     // Span name: "UserService.findById"
 *     return db.users.find(id)
 *   }
 *
 *   @span({ name: 'user.create', attributes: { operation: 'create' } })
 *   async create(data: UserData) {
 *     return db.users.create(data)
 *   }
 * }
 * ```
 */
export function span(options?: SpanOptions) {
  return function (
    target: object,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ): PropertyDescriptor {
    return wrapMethod(target, propertyKey, descriptor, options)
  }
}

/**
 * Decorator to create spans around all methods of a class.
 *
 * Automatically handles:
 * - Creating and closing spans for each method
 * - Capturing exceptions and setting error status
 * - Async/await support
 *
 * @example
 * ```ts
 * import { spanAll } from '@adonisjs/otel'
 *
 * @spanAll()
 * class OrderService {
 *   async create(data: OrderData) {
 *     // Span name: "OrderService.create"
 *     return db.orders.create(data)
 *   }
 *
 *   async findById(id: string) {
 *     // Span name: "OrderService.findById"
 *     return db.orders.find(id)
 *   }
 * }
 *
 * @spanAll({ prefix: 'order' })
 * class OrderService {
 *   async create(data: OrderData) {
 *     // Span name: "order.create"
 *     return db.orders.create(data)
 *   }
 * }
 * ```
 */
export function spanAll(options?: {
  prefix?: string
  attributes?: Record<string, string | number | boolean>
}) {
  return function <T extends Constructor>(constructor: T): T {
    const prototype = constructor.prototype
    const propertyNames = Object.getOwnPropertyNames(prototype)

    for (const propertyName of propertyNames) {
      if (propertyName === 'constructor') continue

      const descriptor = Object.getOwnPropertyDescriptor(prototype, propertyName)
      if (!descriptor || typeof descriptor.value !== 'function') continue

      const spanName = options?.prefix ? `${options.prefix}.${propertyName}` : undefined

      const wrappedDescriptor = wrapMethod(prototype, propertyName, descriptor, {
        name: spanName,
        attributes: options?.attributes,
      })

      Object.defineProperty(prototype, propertyName, wrappedDescriptor)
    }

    return constructor
  }
}
