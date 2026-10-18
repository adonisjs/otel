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
