/**
 * OpenTelemetry initialization file.
 *
 * This file should be loaded BEFORE your application starts
 * to enable auto-instrumentation:
 *
 * ```ts
 * // bin/otel.ts
 * import { init } from '@adonisjs/otel/init'
 * await init(import.meta.dirname)
 * ```
 *
 * Then import it first in bin/server.ts:
 * ```ts
 * import './otel.js'
 * ```
 */

import { createAddHookMessageChannel } from 'import-in-the-middle'
import { register } from 'node:module'
import { join } from 'node:path'

export async function init(dirname: string) {
  // Setup import-in-the-middle hooks for auto-instrumentation
  const { registerOptions, waitForAllMessagesAcknowledged } = createAddHookMessageChannel()
  register('import-in-the-middle/hook.mjs', import.meta.url, registerOptions as any)

  // Import SDK functions after hooks are registered
  const { OtelManager } = await import('./otel.js')

  const configPath = join(dirname, '../config/otel.ts')
  const config = await import(configPath).then((mod) => mod.default || mod)
  if (!config) throw new Error(`Otel configuration not found at ${configPath}`)

  // Check if OTEL is enabled
  if (!OtelManager.isEnabled(config)) return

  const manager = OtelManager.create(config)
  manager?.start()

  await waitForAllMessagesAcknowledged()
}
