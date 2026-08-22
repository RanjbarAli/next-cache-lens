import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ObservableMemoryCacheHandler } from '../../src/cache-handler/index.js'
import { getCacheLensStore, resetGlobalCacheLensStoreForTests } from '../../src/core/event-store.js'
import type { NextCacheEntry } from '../../src/cache-handler/index.js'

function entry(value = 'hello', overrides: Partial<NextCacheEntry> = {}): NextCacheEntry {
  return {
    value: new Blob([value]).stream(),
    tags: ['products'],
    stale: 30,
    timestamp: Date.now(),
    expire: 300,
    revalidate: 60,
    ...overrides,
  }
}

async function text(stream: ReadableStream<Uint8Array>): Promise<string> {
  return new Response(stream).text()
}

describe('observable cache handler', () => {
  beforeEach(() => {
    resetGlobalCacheLensStoreForTests()
    vi.stubEnv('NODE_ENV', 'development')
  })

  it('records misses without exposing the raw cache key', async () => {
    const handler = new ObservableMemoryCacheHandler()
    expect(await handler.get('user:secret@example.com', [])).toBeUndefined()
    const event = getCacheLensStore().snapshot().events[0]
    expect(event?.type).toBe('MISS')
    expect(JSON.stringify(event)).not.toContain('secret@example.com')
  })

  it('stores opaque streams and returns reusable stream clones', async () => {
    const handler = new ObservableMemoryCacheHandler()
    await handler.set('key', Promise.resolve(entry()))
    expect(await text((await handler.get('key', []))?.value as ReadableStream<Uint8Array>)).toBe(
      'hello',
    )
    expect(await text((await handler.get('key', []))?.value as ReadableStream<Uint8Array>)).toBe(
      'hello',
    )
    expect(getCacheLensStore().snapshot().statistics).toMatchObject({ hits: 2, sets: 1 })
  })

  it('waits for a pending set before resolving a concurrent get', async () => {
    const handler = new ObservableMemoryCacheHandler()
    let resolveEntry: ((value: NextCacheEntry) => void) | undefined
    const pending = new Promise<NextCacheEntry>((resolve) => {
      resolveEntry = resolve
    })
    const setPromise = handler.set('key', pending)
    const getPromise = handler.get('key', [])
    resolveEntry?.(entry())
    await setPromise
    expect(await text((await getPromise)?.value as ReadableStream<Uint8Array>)).toBe('hello')
  })

  it('expires entries by lifetime', async () => {
    const handler = new ObservableMemoryCacheHandler()
    await handler.set(
      'old',
      Promise.resolve(entry('old', { timestamp: Date.now() - 5_000, expire: 1 })),
    )
    expect(await handler.get('old', [])).toBeUndefined()
    expect(
      getCacheLensStore()
        .snapshot()
        .events.map((event) => event.type),
    ).toContain('EXPIRE')
  })

  it('expires tags immediately for updateTag semantics', async () => {
    const handler = new ObservableMemoryCacheHandler()
    await handler.set('key', Promise.resolve(entry()))
    await handler.updateTags(['products'])
    expect(await handler.get('key', [])).toBeUndefined()
    expect(await handler.getExpiration(['products'])).toBeGreaterThan(0)
  })

  it('marks profile-based revalidation stale before its expire deadline', async () => {
    const handler = new ObservableMemoryCacheHandler()
    await handler.set('key', Promise.resolve(entry()))
    await handler.updateTags(['products'], { expire: 60 })
    const result = await handler.get('key', [])
    expect(result?.revalidate).toBe(-1)
    expect(
      getCacheLensStore()
        .snapshot()
        .events.map((event) => event.type),
    ).toContain('STALE')
  })

  it('records and propagates failed cache fills', async () => {
    const handler = new ObservableMemoryCacheHandler()
    await expect(handler.set('key', Promise.reject(new Error('fill failed')))).rejects.toThrow(
      'fill failed',
    )
    const error = getCacheLensStore().snapshot().events.at(-1)
    expect(error).toMatchObject({ type: 'ERROR', metadata: { message: 'fill failed' } })
  })
})
