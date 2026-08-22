import { describe, expect, it, vi } from 'vitest'
import { CacheLensEventStore } from '../../src/core/event-store.js'

describe('CacheLensEventStore', () => {
  it('creates monotonic event identifiers and preserves chronology', () => {
    const store = new CacheLensEventStore(100)
    const first = store.record({ type: 'MISS', source: 'cache-handler', cacheId: 'cache_a' })
    const second = store.record({ type: 'SET', source: 'cache-handler', cacheId: 'cache_a' })
    expect(second.sequence).toBe(first.sequence + 1)
    expect(store.snapshot().events.map((event) => event.id)).toEqual([first.id, second.id])
  })

  it('bounds retained events', () => {
    const store = new CacheLensEventStore(100)
    for (let index = 0; index < 120; index += 1) {
      store.record({ type: 'GET', source: 'cache-handler', metadata: { index } })
    }
    const snapshot = store.snapshot()
    expect(snapshot.events).toHaveLength(100)
    expect(snapshot.events[0]?.metadata?.index).toBe(20)
    expect(snapshot.truncated).toBe(true)
  })

  it('aggregates hit, miss, and set counters', () => {
    const store = new CacheLensEventStore()
    store.record({ type: 'MISS', source: 'cache-handler', cacheId: 'cache_a' })
    store.record({
      type: 'SET',
      source: 'cache-handler',
      cacheId: 'cache_a',
      tags: ['products'],
      metadata: { revalidateSeconds: 60, expireSeconds: 300 },
    })
    store.record({ type: 'HIT', source: 'cache-handler', cacheId: 'cache_a' })
    const snapshot = store.snapshot()
    expect(snapshot.entries[0]).toMatchObject({
      hitCount: 1,
      missCount: 1,
      setCount: 1,
      status: 'fresh',
      tags: ['products'],
      revalidateSeconds: 60,
      expireSeconds: 300,
    })
    expect(snapshot.statistics).toMatchObject({ hits: 1, misses: 1, hitRate: 0.5, sets: 1 })
  })

  it('indexes tags and applies invalidation to related entries only', () => {
    const store = new CacheLensEventStore()
    store.record({ type: 'SET', source: 'cache-handler', cacheId: 'a', tags: ['products'] })
    store.record({ type: 'SET', source: 'cache-handler', cacheId: 'b', tags: ['users'] })
    store.record({ type: 'INVALIDATE', source: 'trace-helper', tags: ['products'] })
    const snapshot = store.snapshot()
    expect(snapshot.tags.find((tag) => tag.name === 'products')).toMatchObject({
      entryIds: ['a'],
      invalidationCount: 1,
    })
    expect(snapshot.entries.find((entry) => entry.id === 'a')?.status).toBe('invalidated')
    expect(snapshot.entries.find((entry) => entry.id === 'b')?.status).toBe('fresh')
  })

  it('supports incremental snapshots without omitting aggregate state', () => {
    const store = new CacheLensEventStore()
    const first = store.record({ type: 'MISS', source: 'cache-handler', cacheId: 'a' })
    store.record({ type: 'HIT', source: 'cache-handler', cacheId: 'a' })
    const snapshot = store.snapshot({ since: first.sequence })
    expect(snapshot.events).toHaveLength(1)
    expect(snapshot.statistics).toMatchObject({ hits: 1, misses: 1 })
    expect(snapshot.entries).toHaveLength(1)
  })

  it('notifies and unsubscribes listeners', () => {
    const listener = vi.fn()
    const store = new CacheLensEventStore()
    const unsubscribe = store.subscribe(listener)
    store.record({ type: 'GET', source: 'cache-handler' })
    unsubscribe()
    store.record({ type: 'GET', source: 'cache-handler' })
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('resets snapshots without reusing cursors', () => {
    const store = new CacheLensEventStore()
    const first = store.record({ type: 'GET', source: 'cache-handler' })
    store.reset()
    expect(store.snapshot().events).toEqual([])
    const second = store.record({ type: 'GET', source: 'cache-handler' })
    expect(second.sequence).toBeGreaterThan(first.sequence)
  })

  it('resizes while retaining the newest events', () => {
    const store = new CacheLensEventStore(200)
    for (let index = 0; index < 150; index += 1) {
      store.record({ type: 'GET', source: 'cache-handler', metadata: { index } })
    }
    store.configure(100)
    expect(store.snapshot().events[0]?.metadata?.index).toBe(50)
  })

  it('creates deterministic diagnostics from evidence thresholds', () => {
    const store = new CacheLensEventStore()
    for (let index = 0; index < 5; index += 1) {
      store.record({ type: 'MISS', source: 'cache-handler', cacheId: 'a' })
    }
    const codes = store.snapshot().diagnostics.map((item) => item.code)
    expect(codes).toContain('LOW_HIT_RATE')
    expect(codes).toContain('ENTRY_WITHOUT_TAGS')
    expect(codes).toContain('LIFETIME_UNAVAILABLE')
  })

  it.each([99, 10_001, 2.4])('normalizes or rejects maximum event count %s', (value) => {
    if (Number.isInteger(value)) {
      const store = new CacheLensEventStore(value)
      expect(store.maxEvents).toBe(value < 100 ? 100 : 10_000)
    } else {
      expect(() => new CacheLensEventStore(value)).toThrow(RangeError)
    }
  })
})
