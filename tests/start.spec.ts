import { test } from '@japa/runner'
import { execFile } from 'node:child_process'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

/**
 * Loader hooks are process-wide, so each initialization runs in a fresh process.
 */
async function initialize(disabled: string | undefined, config: string) {
  const directory = await mkdtemp(join(tmpdir(), 'otel-init-'))
  const env: NodeJS.ProcessEnv = { ...process.env, NODE_ENV: 'test' }
  if (disabled === undefined) delete env.OTEL_SDK_DISABLED
  else env.OTEL_SDK_DISABLED = disabled

  try {
    await mkdir(join(directory, 'config'))
    await writeFile(join(directory, 'package.json'), '{"type":"module"}')
    await writeFile(join(directory, 'config/otel.js'), config)

    const { stdout } = await execFileAsync(
      process.execPath,
      [
        '--import',
        new URL('../tsnode.esm.js', import.meta.url).href,
        '--input-type=module',
        '--eval',
        `
          import { init } from ${JSON.stringify(new URL('../src/start.js', import.meta.url).href)}
          await init(${JSON.stringify(directory)})
          console.log(JSON.stringify({ configLoaded: globalThis.configLoaded ?? false }))
        `,
      ],
      { env, timeout: 15_000 }
    )

    return JSON.parse(stdout)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}

test.group('init', (group) => {
  group.each.timeout(20_000)

  test('skips configuration loading when OTEL_SDK_DISABLED is true')
    .with(['true', 'TRUE', 'TrUe'])
    .run(async ({ assert }, value) => {
      const result = await initialize(
        value,
        `export default { enabled: true }
         throw new Error('The disabled integration must not load this config')`
      )

      assert.deepEqual(result, { configLoaded: false })
    })

  test('loads configuration when OTEL_SDK_DISABLED is not true')
    .with([undefined, '', 'false', 'FALSE', '1'])
    .run(async ({ assert }, value) => {
      const result = await initialize(
        value,
        `globalThis.configLoaded = true
         export default { enabled: false }`
      )

      assert.deepEqual(result, { configLoaded: true })
    })
})
