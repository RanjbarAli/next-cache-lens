import { afterEach, describe, expect, it, vi } from 'vitest'
import { isCacheLensEnabled, withCacheLens } from '../../src/config/index.js'
import { assertSupportedNextVersion } from '../../src/core/version.js'

describe('withCacheLens', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('adds both public Cache Components handler slots in development', () => {
    vi.stubEnv('NODE_ENV', 'development')
    const result = withCacheLens({ cacheComponents: true, reactStrictMode: true })
    expect(result.reactStrictMode).toBe(true)
    expect(result.cacheHandlers?.default).toMatch(/cache-handler\.cjs$/)
    expect(result.cacheHandlers?.remote).toBe(result.cacheHandlers?.default)
  })

  it('returns the original config with zero mutation in production', () => {
    vi.stubEnv('NODE_ENV', 'production')
    const config = { cacheComponents: false, poweredByHeader: false } as const
    expect(withCacheLens(config)).toBe(config)
    expect(isCacheLensEnabled()).toBe(false)
  })

  it('can be disabled explicitly', () => {
    vi.stubEnv('NODE_ENV', 'development')
    const config = { cacheComponents: false } as const
    expect(withCacheLens(config, { enabled: false })).toBe(config)
  })

  it('requires Cache Components', () => {
    vi.stubEnv('NODE_ENV', 'development')
    expect(() => withCacheLens({})).toThrow('Cache Components are not enabled')
  })

  it('never overwrites existing cache handlers', () => {
    vi.stubEnv('NODE_ENV', 'development')
    expect(() =>
      withCacheLens({ cacheComponents: true, cacheHandlers: { remote: '/custom.js' } }),
    ).toThrow('Existing custom `cacheHandlers`')
  })

  it.each(['16.0.0', '16.3.2', '16.9.0-canary.1'])('supports Next.js %s', (version) => {
    expect(() => assertSupportedNextVersion(version)).not.toThrow()
  })

  it.each(['15.5.0', '17.0.0', 'not-a-version'])('rejects unsupported Next.js %s', (version) => {
    expect(() => assertSupportedNextVersion(version)).toThrow('[Next Cache Lens]')
  })
})
