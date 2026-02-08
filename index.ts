/*
|--------------------------------------------------------------------------
| Package entrypoint
|--------------------------------------------------------------------------
|
| Export values from the package entrypoint as you see fit.
|
*/

export { configure } from './configure.js'
export { defineConfig } from './src/define_config.js'
export { OtelManager } from './src/otel.js'
export { destinations } from './src/destinations.js'

/**
 * Re-export OTLP exporters so users don't need to install those 100 packages
 * from OpenTelemetry just to get the exporters.
 */
export { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-grpc'
export { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-grpc'
export { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics'
export { ConsoleSpanExporter } from '@opentelemetry/sdk-trace-base'
