/*
|--------------------------------------------------------------------------
| Configure hook
|--------------------------------------------------------------------------
|
| The configure hook is called when someone runs "node ace configure <package>"
| command. You are free to perform any operations inside this function to
| configure the package.
|
| To make things easier, you have access to the underlying "ConfigureCommand"
| instance and you can use codemods to modify the source files.
|
*/

import ConfigureCommand from '@adonisjs/core/commands/configure'
import { stubsRoot } from './stubs/main.js'

export async function configure(command: ConfigureCommand) {
  const codemods = await command.createCodemods()

  /**
   * Publish the configuration file
   */
  await codemods.makeUsingStub(stubsRoot, 'config.stub', {})

  /**
   * Publish the otel.ts file
   */
  await codemods.makeUsingStub(stubsRoot, 'otel.stub', {})

  /**
   * Add import to bin/server.ts as the FIRST import
   * This is critical for auto-instrumentation to work
   */
  const project = await codemods.getTsMorphProject()
  const serverFile = project?.getSourceFile(command.app.makePath('bin/server.ts'))

  if (serverFile) {
    const firstImport = serverFile.getImportDeclarations()[0]
    const insertIndex = firstImport?.getChildIndex() ?? 0

    serverFile.insertStatements(insertIndex, [
      '/**',
      ' * OpenTelemetry initialization - MUST be the first import',
      ' * @see https://opentelemetry.io/docs/languages/js/getting-started/nodejs/',
      ' */',
      `import '../otel.js'`,
      '',
    ])

    await serverFile.save()
  }

  /**
   * Register the provider
   */
  await codemods.updateRcFile((rcFile) => rcFile.addProvider('@adonisjs/otel/otel_provider'))

  /**
   * Register the middleware
   */
  await codemods.registerMiddleware('router', [
    { path: '@adonisjs/otel/otel_middleware', position: 'before' },
  ])

  /**
   * Add new environment variables
   */
  await codemods.defineEnvVariables({
    APP_NAME: command.app.appName,
    APP_VERSION: '0.0.1',
    APP_ENV: 'development',
  })

  await codemods.defineEnvValidations({
    variables: {
      APP_NAME: 'Env.schema.string()',
      APP_VERSION: 'Env.schema.string()',
      APP_ENV: "Env.schema.enum(['development', 'staging', 'production'] as const)",
    },
  })
}
