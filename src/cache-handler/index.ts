import { getCacheLensStore } from '../core/event-store.js'
import { hashCacheKey } from '../core/hash.js'
import { sanitizeError } from '../core/sanitize.js'

interface NextCacheEntry {
  value: ReadableStream<Uint8Array>
  tags: string[]
  stale: number
  timestamp: number
  expire: number
  revalidate: number
}

interface CacheHandlerContract {
  get(cacheKey: string, softTags: string[]): Promise<NextCacheEntry | undefined>
  set(cacheKey: string, pendingEntry: Promise<NextCacheEntry>): Promise<void>
  refreshTags(): Promise<void>
  getExpiration(tags: string[]): Promise<number>
  updateTags(tags: string[], durations?: { expire?: number }): Promise<void>
}

interface StoredEntry {
  entry: NextCacheEntry
  size: number
}

interface TagState {
  staleAt?: number
  expiredAt?: number
}

const MAX_CACHE_BYTES = 50 * 1024 * 1024
const MAX_CACHE_ENTRIES = 500

class ObservableMemoryCacheHandler implements CacheHandlerContract {
  readonly #entries = new Map<string, StoredEntry>()
  readonly #pendingSets = new Map<string, Promise<void>>()
  readonly #tagState = new Map<string, TagState>()
  #totalBytes = 0

  async get(cacheKey: string, softTags: string[]): Promise<NextCacheEntry | undefined> {
    const startedAt = performance.now()
    const cacheId = hashCacheKey(cacheKey)
    const pending = this.#pendingSets.get(cacheKey)
    if (pending) await pending.catch(() => undefined)

    const stored = this.#entries.get(cacheKey)
    if (!stored) {
      getCacheLensStore().record({
        type: 'MISS',
        cacheId,
        source: 'cache-handler',
        durationMs: performance.now() - startedAt,
      })
      return undefined
    }

    const now = Date.now()
    const ageSeconds = (now - stored.entry.timestamp) / 1_000
    const development = process.env.NODE_ENV !== 'production'
    const maxAge = development ? stored.entry.expire : stored.entry.revalidate
    if (stored.entry.expire < 0 || ageSeconds > maxAge) {
      this.#delete(cacheKey)
      getCacheLensStore().record({
        type: 'EXPIRE',
        cacheId,
        tags: stored.entry.tags,
        source: 'cache-handler',
        durationMs: performance.now() - startedAt,
      })
      getCacheLensStore().record({
        type: 'MISS',
        cacheId,
        tags: stored.entry.tags,
        source: 'cache-handler',
      })
      return undefined
    }

    const allTags = [...new Set([...stored.entry.tags, ...softTags])]
    if (this.#hasExpiredTag(allTags, stored.entry.timestamp, now)) {
      this.#delete(cacheKey)
      getCacheLensStore().record({
        type: 'MISS',
        cacheId,
        tags: stored.entry.tags,
        source: 'cache-handler',
        metadata: { reason: 'tag-expired' },
      })
      return undefined
    }

    let revalidate = stored.entry.revalidate
    if (this.#hasStaleTag(allTags, stored.entry.timestamp)) {
      revalidate = -1
      getCacheLensStore().record({
        type: 'STALE',
        cacheId,
        tags: stored.entry.tags,
        source: 'cache-handler',
      })
    }

    this.#entries.delete(cacheKey)
    this.#entries.set(cacheKey, stored)
    const [returnedValue, retainedValue] = stored.entry.value.tee()
    stored.entry.value = retainedValue
    getCacheLensStore().record({
      type: 'HIT',
      cacheId,
      tags: stored.entry.tags,
      source: 'cache-handler',
      durationMs: performance.now() - startedAt,
      metadata: { stale: revalidate === -1 },
    })
    return { ...stored.entry, revalidate, value: returnedValue }
  }

  async set(cacheKey: string, pendingEntry: Promise<NextCacheEntry>): Promise<void> {
    const cacheId = hashCacheKey(cacheKey)
    const startedAt = performance.now()
    const operation = this.#store(cacheKey, cacheId, pendingEntry, startedAt)
    this.#pendingSets.set(cacheKey, operation)
    try {
      await operation
    } finally {
      if (this.#pendingSets.get(cacheKey) === operation) this.#pendingSets.delete(cacheKey)
    }
  }

  refreshTags(): Promise<void> {
    return Promise.resolve()
  }

  getExpiration(tags: string[]): Promise<number> {
    let expiration = 0
    for (const tag of tags) {
      const expiredAt = this.#tagState.get(tag)?.expiredAt ?? 0
      expiration = Math.max(expiration, expiredAt)
    }
    return Promise.resolve(expiration)
  }

  updateTags(tags: string[], durations?: { expire?: number }): Promise<void> {
    const now = Date.now()
    for (const tag of tags) {
      const previous = this.#tagState.get(tag) ?? {}
      if (durations) {
        this.#tagState.set(tag, {
          ...previous,
          staleAt: now,
          ...(durations.expire !== undefined
            ? { expiredAt: now + Math.max(0, durations.expire) * 1_000 }
            : {}),
        })
      } else {
        this.#tagState.set(tag, { ...previous, expiredAt: now })
      }
    }
    getCacheLensStore().record({
      type: durations ? 'REVALIDATE' : 'INVALIDATE',
      tags,
      source: 'cache-handler',
      ...(durations?.expire === undefined ? {} : { metadata: { expireSeconds: durations.expire } }),
    })
    return Promise.resolve()
  }

  async #store(
    cacheKey: string,
    cacheId: string,
    pendingEntry: Promise<NextCacheEntry>,
    startedAt: number,
  ): Promise<void> {
    try {
      const entry = await pendingEntry
      if (process.env.NODE_ENV === 'production' && entry.expire === 0) return
      const [retainedValue, measuringValue] = entry.value.tee()
      entry.value = retainedValue
      const size = await measureStream(measuringValue)
      const existing = this.#entries.get(cacheKey)
      if (existing) this.#totalBytes -= existing.size
      this.#entries.delete(cacheKey)
      this.#entries.set(cacheKey, { entry, size })
      this.#totalBytes += size
      this.#evictIfNeeded()
      getCacheLensStore().record({
        type: 'SET',
        cacheId,
        tags: entry.tags,
        source: 'cache-handler',
        durationMs: performance.now() - startedAt,
        metadata: {
          revalidateSeconds: entry.revalidate,
          expireSeconds: entry.expire,
          staleSeconds: entry.stale,
          bytes: size,
        },
      })
    } catch (error) {
      getCacheLensStore().record({
        type: 'ERROR',
        cacheId,
        source: 'cache-handler',
        durationMs: performance.now() - startedAt,
        metadata: { operation: 'set', message: sanitizeError(error) },
      })
      throw error
    }
  }

  #hasExpiredTag(tags: readonly string[], entryTimestamp: number, now: number): boolean {
    return tags.some((tag) => {
      const state = this.#tagState.get(tag)
      return (
        state?.expiredAt !== undefined &&
        state.expiredAt >= entryTimestamp &&
        now >= state.expiredAt
      )
    })
  }

  #hasStaleTag(tags: readonly string[], entryTimestamp: number): boolean {
    return tags.some((tag) => {
      const staleAt = this.#tagState.get(tag)?.staleAt
      return staleAt !== undefined && staleAt >= entryTimestamp
    })
  }

  #delete(cacheKey: string): void {
    const existing = this.#entries.get(cacheKey)
    if (!existing) return
    this.#totalBytes -= existing.size
    this.#entries.delete(cacheKey)
  }

  #evictIfNeeded(): void {
    while (this.#entries.size > MAX_CACHE_ENTRIES || this.#totalBytes > MAX_CACHE_BYTES) {
      const oldestKey = this.#entries.keys().next().value
      if (oldestKey === undefined) break
      this.#delete(oldestKey)
    }
  }
}

async function measureStream(stream: ReadableStream<Uint8Array>): Promise<number> {
  let size = 0
  const reader = stream.getReader()
  for (;;) {
    const result = await reader.read()
    if (result.done) break
    size += result.value.byteLength
  }
  return size
}

const cacheHandler: CacheHandlerContract = new ObservableMemoryCacheHandler()

export default cacheHandler
export { ObservableMemoryCacheHandler }
export type { CacheHandlerContract, NextCacheEntry }
