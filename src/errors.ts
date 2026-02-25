import { createError } from '@poppinss/utils/exception'

export const E_OTEL_CONFIG = createError<[configPath: string]>(
  'Failed to load OpenTelemetry config at "%s". Make sure the file exists and has no syntax errors.',
  'E_OTEL_CONFIG'
)

export const E_OTEL_CONFIG_INVALID = createError<[configPath: string]>(
  'OpenTelemetry config at "%s" must export a configuration object.',
  'E_OTEL_CONFIG_INVALID'
)
