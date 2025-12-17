import type { InstrumentationConfigMap } from '@opentelemetry/auto-instrumentations-node'
import type { HttpInstrumentationConfig } from './types/instrumentations.js'

/**
 * Handles URL filtering for OpenTelemetry HTTP instrumentation.
 * Determines which requests should be ignored (not traced).
 */
export class HttpUrlFilter {
  static readonly DEFAULT_IGNORED_URLS = [
    '/health',
    '/healthz',
    '/internal/healthz',
    '/ready',
    '/readiness',
    '/metrics',
    '/internal/metrics',
  ]

  static readonly STATIC_FILE_EXTENSIONS = new Set([
    'css',
    'js',
    'mjs',
    'cjs',
    'ts',
    'tsx',
    'jsx',
    'map',
    'woff',
    'woff2',
    'ttf',
    'eot',
    'otf',
    'svg',
    'png',
    'jpg',
    'jpeg',
    'gif',
    'webp',
    'ico',
    'avif',
    'mp4',
    'webm',
    'mp3',
    'ogg',
    'wav',
    'pdf',
  ])

  #ignoredUrls: string[]
  #ignoreStaticFiles: boolean
  #userIgnoreHook?: (request: { url?: string }) => boolean

  constructor(config?: HttpInstrumentationConfig) {
    this.#ignoredUrls = this.#buildIgnoredUrls(config)
    this.#ignoreStaticFiles = config?.ignoreStaticFiles !== false
    this.#userIgnoreHook = config?.ignoreIncomingRequestHook
  }

  #buildIgnoredUrls(config?: HttpInstrumentationConfig): string[] {
    const userUrls = config?.ignoredUrls || []
    const mergeWithDefaults = config?.mergeIgnoredUrls !== false

    if (!mergeWithDefaults) return userUrls

    return [...HttpUrlFilter.DEFAULT_IGNORED_URLS, ...userUrls]
  }

  #isStaticFile(url: string): boolean {
    const lastSegment = url.split('/').pop() || ''
    const dotIndex = lastSegment.lastIndexOf('.')

    if (dotIndex === -1) return false

    const extension = lastSegment.slice(dotIndex + 1).toLowerCase()
    return HttpUrlFilter.STATIC_FILE_EXTENSIONS.has(extension)
  }

  #matchesPattern(urlPath: string, pattern: string): boolean {
    if (pattern.endsWith('/*')) {
      const prefix = pattern.slice(0, -2)
      return urlPath === prefix || urlPath.startsWith(prefix + '/')
    }

    return urlPath === pattern || urlPath.startsWith(pattern + '/')
  }

  /**
   * Check if a URL should be ignored (not traced).
   * A URL is ignored if:
   * - It's a static file and ignoreStaticFiles is true (default)
   * - It matches the ignored URLs list (exact or prefix pattern)
   * - The user's custom hook returns true
   */
  shouldIgnore(url: string | undefined): boolean {
    if (!url) return false

    const urlPath = url.split('?')[0]

    if (this.#ignoreStaticFiles && this.#isStaticFile(urlPath)) return true
    if (this.#ignoredUrls.some((pattern) => this.#matchesPattern(urlPath, pattern))) return true
    if (this.#userIgnoreHook) return this.#userIgnoreHook({ url })

    return false
  }

  /**
   * Apply HTTP instrumentation config to the merged config map
   */
  applyToConfig(
    mergedConfig: InstrumentationConfigMap,
    userHttpConfig?: HttpInstrumentationConfig
  ): void {
    const httpKey = '@opentelemetry/instrumentation-http' as const
    const currentConfig = mergedConfig[httpKey]

    if (currentConfig && 'enabled' in currentConfig && currentConfig.enabled === false) {
      return
    }

    mergedConfig[httpKey] = {
      ...currentConfig,
      ...userHttpConfig,
      ignoreIncomingRequestHook: (req: { url?: string }) => this.shouldIgnore(req.url),
    }
  }
}
