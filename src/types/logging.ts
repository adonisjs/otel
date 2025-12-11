/**
 * Fields hidden by default in pino-pretty output
 */
export const hiddenFields = [
  'pid',
  'hostname',
  'trace_id',
  'span_id',
  'trace_flags',
  'route',
  'request_id',
  'x-request-id',
] as const

export type HiddenField = (typeof hiddenFields)[number]

export interface OtelLoggingPresetOptions {
  /**
   * Fields to keep visible in logs (not hidden).
   * Useful if you want to see trace context in development.
   */
  keep?: HiddenField[]
}
