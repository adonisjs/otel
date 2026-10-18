# @adonisjs/otel

<br />

[![gh-workflow-image]][gh-workflow-url] [![npm-image]][npm-url] ![][typescript-image] [![license-image]][license-url]

## Introduction

OpenTelemetry integration for AdonisJS with sensible defaults and zero-config setup. Get distributed tracing, metrics, and automatic instrumentation out of the box.

## Official Documentation

The documentation is available on the [AdonisJS website](https://docs.adonisjs.com/guides/digging-deeper/opentelemetry)

## Disabling telemetry

Set `OTEL_SDK_DISABLED=true` before starting your application to skip OpenTelemetry initialization:

```sh
OTEL_SDK_DISABLED=true node bin/server.js
```

With this flag, `init()` returns before it registers the ESM loader hook, imports the SDK, or loads `config/otel.ts`. The flag overrides `enabled: true` in the configuration. The provider and middleware can remain registered.

Only `true`, in any letter case, skips initialization. Other values leave the configuration in control. Setting the variable to `false` does not force the SDK to start or change the default of disabling it in tests.

Set the variable in your shell or deployment environment before `init()` runs. A value loaded later from `.env` by `#start/env` is too late. Changing the flag after initialization does not remove an existing hook or stop a running SDK.

The `enabled: false` configuration option prevents the SDK from starting, but leaves the loader hook installed. The hook must precede the configuration because its imports can load dependencies that need instrumentation. To avoid the hook, use `OTEL_SDK_DISABLED=true` or skip the `init()` call.

## Migrate from the OpenTelemetry 0.213 release line

The unreleased upgrade to OpenTelemetry SDK 0.223 and auto-instrumentations 0.81 requires a major release of this package. Before deploying it, update queries, dashboards, alerts, and custom SDK components that depend on the previous telemetry format or APIs.

### Update HTTP queries and metric units

HTTP instrumentation now emits only stable semantic conventions. Update attribute references, including:

- `http.method` to `http.request.method`.
- `http.status_code` to `http.response.status_code`.
- `http.url` to `url.full`.
- `http.target` to `url.path` and `url.query` on server spans.
- `http.user_agent` to `user_agent.original`.

The HTTP duration metrics change from `http.server.duration` and `http.client.duration`, measured in milliseconds, to `http.server.request.duration` and `http.client.request.duration`, measured in seconds. Update thresholds as well as metric names. The `http.route` attribute is unchanged.

`OTEL_SEMCONV_STABILITY_OPT_IN=http/dup` no longer restores legacy HTTP output. Server spans also redact known credential-bearing query parameters by default. See the [HTTP instrumentation documentation](https://github.com/open-telemetry/opentelemetry-js/blob/experimental/v0.223.0/experimental/packages/opentelemetry-instrumentation-http/README.md) for the full attribute list and redaction options.

### Update database queries and runtime metrics

Affected database instrumentations now emit only stable semantic conventions. Update queries and filters that use these legacy attributes:

- `db.system` to `db.system.name`.
- `db.name` to `db.namespace`.
- `db.statement` to `db.query.text`.
- `db.operation` to `db.operation.name`.
- `net.peer.name` and `net.peer.port` to `server.address` and `server.port`.

Remove dependencies on `db.user` and `db.connection_string`; they have no automatic replacement. Legacy or duplicate database output is no longer a fallback for affected instrumentations. For OracleDB, `db.namespace` now contains `DB_UNIQUE_NAME` instead of the previous instance, PDB, and service combination.

MySQL and MongoDB rename `db.client.connections.usage` to `db.client.connection.count`. See the [database and network migration](https://github.com/open-telemetry/opentelemetry-js-contrib/pull/3585) for the affected instrumentations. The package's existing defaults still disable PostgreSQL, MySQL, and MySQL2 instrumentation unless explicitly enabled.

Runtime instrumentation removes `v8js.memory.heap.limit`. Use `v8js.memory.heap.space.size` to measure allocated space, not the maximum V8 heap limit. The replacement is an observable up/down counter rather than a gauge; update metric storage queries as well as names. `v8js.memory.heap.used` remains a per-space gauge, so sum spaces to obtain a per-instance total before aggregating over time.

### Replace removed Fastify instrumentation

The auto-instrumentation bundle no longer includes Fastify instrumentation. If your application uses Fastify, configure `@fastify/otel` explicitly. AdonisJS HTTP instrumentation remains available.

### Update custom SDK components

The `destinations.otlp()` configuration is unchanged. If you construct your own log processors, pass an options object:

```ts
new BatchLogRecordProcessor({ exporter, ...batchOptions })
new SimpleLogRecordProcessor({ exporter })
```

Do not apply this constructor change to trace processors imported from `@opentelemetry/sdk-trace-base`.

Custom log exporters must implement `forceFlush()`. Replace `LoggerProvider`'s removed `forceFlushTimeoutMillis` option with `provider.forceFlush({ timeoutMillis })`. Rename `LoggerOptions.scopeAttributes` to `attributes`, and replace `NOOP_LOGGER` or `NoopLogger` with `createNoopLogger()`. Custom Logger implementations must implement `enabled()`.

For log processor option types, replace `BufferConfig` with `BatchLogRecordProcessorOptions` and `BatchLogRecordProcessorBrowserConfig` with `BatchLogRecordProcessorBrowserOptions`.

For the re-exported gRPC exporters, pass gRPC `metadata` instead of the removed `headers` option. The old option was already ignored at runtime; its removal now rejects it at typecheck time. OTLP HTTP exporters still support `headers`.

If you use OpenTelemetry's separate declarative configuration entrypoint, rename `OTEL_EXPERIMENTAL_CONFIG_FILE` to `OTEL_CONFIG_FILE` and review its schema changes. This package continues to construct `NodeSDK` directly. See the [SDK breaking changes](https://github.com/open-telemetry/opentelemetry-js/blob/experimental/v0.223.0/experimental/CHANGELOG.md) for details affecting custom SDK implementations.

## Contributing

One of the primary goals of AdonisJS is to have a vibrant community of users and contributors who believes in the principles of the framework.

We encourage you to read the [contribution guide](https://github.com/adonisjs/.github/blob/main/docs/CONTRIBUTING.md) before contributing to the framework.

## Code of Conduct

In order to ensure that the AdonisJS community is welcoming to all, please review and abide by the [Code of Conduct](https://github.com/adonisjs/.github/blob/main/docs/CODE_OF_CONDUCT.md).

## License

AdonisJS OpenTelemetry is open-sourced software licensed under the [MIT license](LICENSE.md).

[gh-workflow-image]: https://img.shields.io/github/actions/workflow/status/adonisjs/otel/checks.yml?style=for-the-badge
[gh-workflow-url]: https://github.com/adonisjs/otel/actions/workflows/checks.yml 'Github action'
[npm-image]: https://img.shields.io/npm/v/@adonisjs/otel/latest.svg?style=for-the-badge&logo=npm
[npm-url]: https://www.npmjs.com/package/@adonisjs/otel/v/latest 'npm'
[typescript-image]: https://img.shields.io/badge/Typescript-294E80.svg?style=for-the-badge&logo=typescript
[license-url]: LICENSE.md
[license-image]: https://img.shields.io/github/license/adonisjs/otel?style=for-the-badge
