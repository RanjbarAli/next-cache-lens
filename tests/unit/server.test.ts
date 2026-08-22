import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createCacheLensRoute } from '../../src/server/index.js'
import { getCacheLensStore, resetGlobalCacheLensStoreForTests } from '../../src/core/event-store.js'

const revalidateTag = vi.fn()
vi.mock('next/cache.js', () => ({ revalidateTag }))

function post(body: string, headers: Record<string, string> = {}): Request {
  return new Request('http://localhost:3210/api/cache-lens', {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'http://localhost:3210', ...headers },
    body,
  })
}

describe('createCacheLensRoute', () => {
  beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'development')
    resetGlobalCacheLensStoreForTests()
    revalidateTag.mockReset()
  })
  afterEach(() => vi.unstubAllEnvs())

  it('returns typed snapshots with security headers', async () => {
    getCacheLensStore().record({ type: 'GET', source: 'cache-handler' })
    const response = await createCacheLensRoute().GET(
      new Request('http://localhost:3210/api/cache-lens?since=0&limit=10'),
    )
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toContain('no-store')
    expect(response.headers.get('x-content-type-options')).toBe('nosniff')
    expect(await response.json()).toMatchObject({ ok: true, snapshot: { cursor: 1 } })
  })

  it.each(['since=-1', 'since=abc', 'limit=0', 'limit=1001'])(
    'rejects malformed query %s',
    async (query) => {
      const response = await createCacheLensRoute().GET(
        new Request(`http://localhost:3210/api/cache-lens?${query}`),
      )
      expect(response.status).toBe(400)
    },
  )

  it('uses the Route Handler-supported stale-while-revalidate operation', async () => {
    const response = await createCacheLensRoute().POST(
      post(JSON.stringify({ operation: 'revalidate-tag', tag: 'products' })),
    )
    expect(response.status).toBe(200)
    expect(revalidateTag).toHaveBeenCalledWith('products', 'max')
  })

  it.each([
    JSON.stringify({ operation: 'revalidate-tag', tag: '' }),
    JSON.stringify({ operation: 'revalidate-tag', tag: 'bad\ntag' }),
    JSON.stringify({ operation: 'revalidate-tag', tag: 'x'.repeat(257) }),
    JSON.stringify({ operation: 'unknown' }),
    'not json',
  ])('rejects malformed mutation input', async (body) => {
    const response = await createCacheLensRoute().POST(post(body))
    expect(response.status).toBe(400)
  })

  it('requires JSON', async () => {
    const response = await createCacheLensRoute().POST(post('{}', { 'content-type': 'text/plain' }))
    expect(response.status).toBe(415)
  })

  it('rejects oversized bodies with and without Content-Length', async () => {
    const declared = await createCacheLensRoute().POST(post('{}', { 'content-length': '5000' }))
    const actual = await createCacheLensRoute().POST(post(`{"operation":"${'x'.repeat(5000)}"}`))
    expect(declared.status).toBe(413)
    expect(actual.status).toBe(413)
  })

  it('rejects cross-origin mutations', async () => {
    const response = await createCacheLensRoute().POST(
      post('{"operation":"reset"}', { origin: 'https://attacker.example' }),
    )
    expect(response.status).toBe(403)
  })

  it('clears history', async () => {
    getCacheLensStore().record({ type: 'GET', source: 'cache-handler' })
    const response = await createCacheLensRoute().POST(post('{"operation":"reset"}'))
    expect(response.status).toBe(200)
    expect(getCacheLensStore().snapshot().events).toEqual([])
  })

  it('is disabled in production even when enabled is requested', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    const route = createCacheLensRoute({ enabled: true })
    expect((await route.GET(new Request('http://localhost:3210/api/cache-lens'))).status).toBe(404)
    expect((await route.POST(post('{"operation":"reset"}'))).status).toBe(404)
  })
})
