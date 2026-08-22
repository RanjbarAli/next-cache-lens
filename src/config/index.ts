import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { NextConfig } from 'next'
import { assertSupportedNextVersion } from '../core/version.js'

const PREFIX = '[Next Cache Lens]'
const moduleReference = typeof __filename === 'string' ? __filename : import.meta.url
const require = createRequire(moduleReference)

export interface CacheLensConfigOptions {
  /** Disable the integration explicitly. Production is always disabled in v1. */
  enabled?: boolean
}

export function withCacheLens<T extends NextConfig>(
  nextConfig: T,
  options: CacheLensConfigOptions = {},
): T & NextConfig {
  if (!isCacheLensEnabled(options)) return nextConfig

  assertSupportedNextVersion(readNextVersion())
  if (nextConfig.cacheComponents !== true) {
    throw new Error(
      `${PREFIX} Cache Components are not enabled. Enable \`cacheComponents: true\` in your Next.js configuration before using cache inspection.`,
    )
  }
  if (nextConfig.cacheHandlers && Object.keys(nextConfig.cacheHandlers).length > 0) {
    throw new Error(
      `${PREFIX} Existing custom \`cacheHandlers\` were detected. Next Cache Lens will not overwrite them because doing so could change cache semantics. Remove withCacheLens(), or use the tracing helpers without cache inspection.`,
    )
  }

  const handlerPath = resolve(outputDirectory(), 'cache-handler.cjs')
  return {
    ...nextConfig,
    cacheHandlers: {
      default: handlerPath,
      remote: handlerPath,
    },
  }
}

function outputDirectory(): string {
  if (typeof __dirname === 'string') return __dirname
  return dirname(fileURLToPath(import.meta.url))
}

export function isCacheLensEnabled(options: CacheLensConfigOptions = {}): boolean {
  return process.env.NODE_ENV !== 'production' && options.enabled !== false
}

function readNextVersion(): string {
  try {
    const packageMetadata = require('next/package.json') as unknown
    if (
      typeof packageMetadata === 'object' &&
      packageMetadata !== null &&
      'version' in packageMetadata &&
      typeof packageMetadata.version === 'string'
    ) {
      return packageMetadata.version
    }
  } catch (error) {
    throw new Error(`${PREFIX} Next.js is not installed or its package metadata cannot be read.`, {
      cause: error,
    })
  }
  throw new Error(`${PREFIX} The installed Next.js package does not expose a valid version.`)
}
