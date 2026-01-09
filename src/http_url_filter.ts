import type { InstrumentationConfigMap } from '@opentelemetry/auto-instrumentations-node'
import type { HttpInstrumentationConfig, IgnoreRequestInfo } from './types/instrumentations.js'
import debug from './debug.js'

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
    '/favicon.ico',
    '/robots.txt',
    '/sitemap.xml',
    '/manifest.json',
    '/site.webmanifest',
    '/browserconfig.xml',
    '/ads.txt',
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
    'vue',
    'svelte',
    'webmanifest',
    'txt',
    'xml',
  ])

  static readonly DEV_SERVER_PATTERNS = ['/@vite/', '/@id/', '/@fs/', '/__vite', '/@react-refresh']

  #ignoredUrls: string[]
  #ignoreStaticFiles: boolean
  #ignoreOptionsRequests: boolean
  #userIgnoreHook?: (request: IgnoreRequestInfo) => boolean

  constructor(config?: HttpInstrumentationConfig) {
    this.#ignoredUrls = this.#buildIgnoredUrls(config)
    this.#ignoreStaticFiles = config?.ignoreStaticFiles !== false
    this.#ignoreOptionsRequests = config?.ignoreOptionsRequests !== false
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

  #isDevServerRequest(url: string): boolean {
    return HttpUrlFilter.DEV_SERVER_PATTERNS.some((pattern) => url.startsWith(pattern))
  }

  #matchesPattern(urlPath: string, pattern: string): boolean {
    if (pattern.endsWith('/*')) {
      const prefix = pattern.slice(0, -2)
      return urlPath === prefix || urlPath.startsWith(prefix + '/')
    }

    return urlPath === pattern || urlPath.startsWith(pattern + '/')
  }

  /**
   * Check if a request should be ignored (not traced).
   * A request is ignored if:
   * - It's an OPTIONS request and ignoreOptionsRequests is true (default)
   * - It's a static file and ignoreStaticFiles is true (default)
   * - It matches the ignored URLs list (exact or prefix pattern)
   * - The user's custom hook returns true
   */
  shouldIgnore(request: IgnoreRequestInfo): boolean {
    const { url, method } = request

    if (this.#ignoreOptionsRequests && method === 'OPTIONS') {
      debug('ignoring request "%s %s" (reason: OPTIONS method)', method, url)
      return true
    }

    if (!url) return false

    const urlPath = url.split('?')[0]

    if (this.#ignoreStaticFiles && this.#isStaticFile(urlPath)) {
      debug('ignoring request "%s %s" (reason: static file)', method, urlPath)
      return true
    }

    if (this.#ignoreStaticFiles && this.#isDevServerRequest(urlPath)) {
      debug('ignoring request "%s %s" (reason: dev server pattern)', method, urlPath)
      return true
    }

    if (this.#ignoredUrls.some((pattern) => this.#matchesPattern(urlPath, pattern))) {
      debug('ignoring request "%s %s" (reason: ignored url pattern)', method, urlPath)
      return true
    }

    if (this.#userIgnoreHook && this.#userIgnoreHook(request)) {
      debug('ignoring request "%s %s" (reason: user hook)', method, urlPath)
      return true
    }

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
      ignoreIncomingRequestHook: (req: { url?: string; method?: string }) =>
        this.shouldIgnore({ url: req.url, method: req.method }),
    }
  }
}
