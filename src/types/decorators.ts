/**
 * Options for span decorators
 */
export interface SpanOptions {
  /**
   * Custom span name. Defaults to `ClassName.methodName`
   */
  name?: string

  /**
   * Additional attributes to add to the span
   */
  attributes?: Record<string, string | number | boolean>
}
