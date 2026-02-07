/**
 * OpenTelemetry initialization file.
 *
 * This file should be loaded BEFORE your application starts
 * to enable auto-instrumentation:
 *
 * ```ts
 * // otel.ts
 * import { init } from '@adonisjs/otel/init'
 * await init(import.meta.dirname)
 * ```
 *
 * Then import it first in bin/server.ts:
 * ```ts
 * import '../otel.js'
 * ```
 */

import { createAddHookMessageChannel } from 'import-in-the-middle'
import { register } from 'node:module'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

import { E_OTEL_CONFIG, E_OTEL_CONFIG_INVALID } from './errors.js'

async function loadConfig(path: string) {
  return await import(pathToFileURL(path).href)
    .then((mod) => mod.default || mod)
    .catch((error) => {
      throw new E_OTEL_CONFIG([path], { cause: error })
    })
}

function setupHooks() {
  const { registerOptions, waitForAllMessagesAcknowledged } = createAddHookMessageChannel()
  register('import-in-the-middle/hook.mjs', import.meta.url, registerOptions as any)
  return waitForAllMessagesAcknowledged
}

export async function init(dirname: string) {
  // Setup import-in-the-middle hooks for auto-instrumentation
  const waitForAllMessagesAcknowledged = setupHooks()

  // Import SDK functions after hooks are registered
  const { OtelManager } = await import('./otel.js')

  const configPath = join(dirname, 'config/otel.js')
  const config = await loadConfig(configPath)
  if (!config) throw new E_OTEL_CONFIG_INVALID([configPath])

  // Check if OTEL is enabled
  if (!OtelManager.isEnabled(config)) return

  const manager = OtelManager.create(config)
  manager?.start()

  await waitForAllMessagesAcknowledged()
}
