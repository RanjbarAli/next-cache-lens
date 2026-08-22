import { createDiagnostics } from './diagnostics.js'
import { RingBuffer } from './ring-buffer.js'
import { sanitizeMetadata } from './sanitize.js'
import type {
  CacheEntrySnapshot,
  CacheEventSource,
  CacheEventType,
  CacheLensEvent,
  CacheLensSnapshot,
  CacheTagSnapshot,
  SafePrimitive,
} from '../types/index.js'

const DEFAULT_MAX_EVENTS = 1_000
const MIN_MAX_EVENTS = 100
const MAX_MAX_EVENTS = 10_000

export interface RecordCacheEventInput {
  timestamp?: number
  type: CacheEventType
  cacheId?: string
  tags?: readonly string[]
  durationMs?: number
  source: CacheEventSource
  sourceLocation?: string
  metadata?: Readonly<Record<string, unknown>>
}

type MutableEntry = CacheEntrySnapshot

interface MutableTag {
  name: string
  entryIds: Set<string>
  invalidationCount: number
  lastInvalidatedAt?: number
}

export class CacheLensEventStore {
  #events: RingBuffer<CacheLensEvent>
  readonly #entries = new Map<string, MutableEntry>()
  readonly #tags = new Map<string, MutableTag>()
  readonly #listeners = new Set<(event: CacheLensEvent) => void>()
  #sequence = 0

  constructor(maxEvents = DEFAULT_MAX_EVENTS) {
    this.#events = new RingBuffer(normalizeMaxEvents(maxEvents))
  }

  get maxEvents(): number {
    return this.#events.capacity
  }

  configure(maxEvents: number): void {
    const normalized = normalizeMaxEvents(maxEvents)
    if (normalized === this.#events.capacity) return
    const next = new RingBuffer<CacheLensEvent>(normalized)
    for (const event of this.#events.toArray().slice(-normalized)) next.push(event)
    this.#events = next
  }

  record(input: RecordCacheEventInput): CacheLensEvent {
    const sequence = ++this.#sequence
    const timestamp = input.timestamp ?? Date.now()
    const tags = input.tags ? [...new Set(input.tags)].slice(0, 128) : undefined
    const metadata = sanitizeMetadata(input.metadata)
    const event: CacheLensEvent = {
      id: `evt_${sequence.toString(36)}`,
      sequence,
      timestamp,
      type: input.type,
      source: input.source,
      ...(input.cacheId ? { cacheId: input.cacheId } : {}),
      ...(tags && tags.length > 0 ? { tags } : {}),
      ...(input.durationMs !== undefined && Number.isFinite(input.durationMs)
        ? { durationMs: Math.max(0, input.durationMs) }
        : {}),
      ...(input.sourceLocation ? { sourceLocation: input.sourceLocation } : {}),
      ...(metadata ? { metadata } : {}),
    }
    this.#events.push(event)
    this.#aggregate(event)
    for (const listener of this.#listeners) listener(event)
    return event
  }

  reset(): void {
    this.#events.clear()
    this.#entries.clear()
    this.#tags.clear()
  }

  subscribe(listener: (event: CacheLensEvent) => void): () => void {
    this.#listeners.add(listener)
    return () => this.#listeners.delete(listener)
  }

  snapshot(options: { since?: number; limit?: number } = {}): CacheLensSnapshot {
    const allEvents = this.#events.toArray()
    const since = options.since ?? 0
    const limit = Math.min(Math.max(options.limit ?? this.maxEvents, 1), this.maxEvents)
    const matchingEvents = allEvents.filter((event) => event.sequence > since)
    const events = matchingEvents.slice(-limit)
    const entries = [...this.#entries.values()].map(cloneEntry).sort(sortEntries)
    const tags = [...this.#tags.values()].map(cloneTag).sort((a, b) => a.name.localeCompare(b.name))
    const hits = entries.reduce((sum, entry) => sum + entry.hitCount, 0)
    const misses = entries.reduce((sum, entry) => sum + entry.missCount, 0)
    const sets = entries.reduce((sum, entry) => sum + entry.setCount, 0)
    const attempts = hits + misses
    const invalidations = allEvents.filter((event) => event.type === 'INVALIDATE').length
    const revalidations = allEvents.filter((event) => event.type === 'REVALIDATE').length

    return {
      generatedAt: Date.now(),
      cursor: this.#sequence,
      events,
      entries,
      tags,
      statistics: {
        entries: entries.length,
        hits,
        misses,
        ...(attempts > 0 ? { hitRate: hits / attempts } : {}),
        sets,
        invalidations,
        revalidations,
        activeTags: tags.length,
        eventCount: allEvents.length,
      },
      diagnostics: createDiagnostics(entries, tags),
      truncated: matchingEvents.length > events.length || (allEvents[0]?.sequence ?? 1) > since + 1,
    }
  }

  #aggregate(event: CacheLensEvent): void {
    if (event.type === 'INVALIDATE' || event.type === 'REVALIDATE') {
      for (const tagName of event.tags ?? []) {
        const tag = this.#getTag(tagName)
        tag.invalidationCount += 1
        tag.lastInvalidatedAt = event.timestamp
        for (const entryId of tag.entryIds) {
          const entry = this.#entries.get(entryId)
          if (!entry) continue
          entry.status = event.type === 'REVALIDATE' ? 'stale' : 'invalidated'
          entry.invalidationCount += 1
          entry.lastInvalidatedAt = event.timestamp
          entry.lastInvalidatedBy = tagName
        }
      }
    }

    if (!event.cacheId) return
    const entry = this.#getEntry(event.cacheId, event)
    entry.source = event.source
    if (event.sourceLocation) entry.sourceLocation = event.sourceLocation
    if (event.tags) this.#associateTags(entry, event.tags)

    switch (event.type) {
      case 'HIT':
        entry.hitCount += 1
        entry.lastAccessedAt = event.timestamp
        entry.status = 'fresh'
        break
      case 'MISS':
        entry.missCount += 1
        entry.lastAccessedAt = event.timestamp
        if (entry.status === 'fresh') entry.status = 'unknown'
        break
      case 'SET': {
        entry.setCount += 1
        entry.createdAt = event.timestamp
        entry.lastAccessedAt = event.timestamp
        entry.status = 'fresh'
        const revalidate = numberMetadata(event.metadata, 'revalidateSeconds')
        const expire = numberMetadata(event.metadata, 'expireSeconds')
        if (revalidate !== undefined) {
          entry.revalidateSeconds = revalidate
          entry.staleAt = event.timestamp + revalidate * 1_000
        }
        if (expire !== undefined) {
          entry.expireSeconds = expire
          entry.expiresAt = event.timestamp + expire * 1_000
        }
        break
      }
      case 'STALE':
        entry.status = 'stale'
        entry.lastAccessedAt = event.timestamp
        break
      case 'EXPIRE':
        entry.status = 'expired'
        entry.lastAccessedAt = event.timestamp
        break
      default:
        break
    }
  }

  #getEntry(id: string, event: CacheLensEvent): MutableEntry {
    const existing = this.#entries.get(id)
    if (existing) return existing
    const created: MutableEntry = {
      id,
      status: 'unknown',
      tags: [],
      hitCount: 0,
      missCount: 0,
      setCount: 0,
      invalidationCount: 0,
      source: event.source,
    }
    this.#entries.set(id, created)
    return created
  }

  #getTag(name: string): MutableTag {
    const existing = this.#tags.get(name)
    if (existing) return existing
    const created: MutableTag = { name, entryIds: new Set(), invalidationCount: 0 }
    this.#tags.set(name, created)
    return created
  }

  #associateTags(entry: MutableEntry, tags: readonly string[]): void {
    const unique = new Set([...entry.tags, ...tags])
    entry.tags = [...unique].sort()
    for (const tagName of tags) this.#getTag(tagName).entryIds.add(entry.id)
  }
}

function normalizeMaxEvents(value: number): number {
  if (!Number.isSafeInteger(value)) {
    throw new RangeError('Maximum event count must be an integer.')
  }
  return Math.min(Math.max(value, MIN_MAX_EVENTS), MAX_MAX_EVENTS)
}

function numberMetadata(
  metadata: Readonly<Record<string, SafePrimitive>> | undefined,
  key: string,
): number | undefined {
  const value = metadata?.[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function cloneEntry(entry: MutableEntry): CacheEntrySnapshot {
  return { ...entry, tags: [...entry.tags] }
}

function cloneTag(tag: MutableTag): CacheTagSnapshot {
  return {
    name: tag.name,
    entryIds: [...tag.entryIds].sort(),
    invalidationCount: tag.invalidationCount,
    ...(tag.lastInvalidatedAt !== undefined ? { lastInvalidatedAt: tag.lastInvalidatedAt } : {}),
  }
}

function sortEntries(a: CacheEntrySnapshot, b: CacheEntrySnapshot): number {
  return (b.lastAccessedAt ?? b.createdAt ?? 0) - (a.lastAccessedAt ?? a.createdAt ?? 0)
}

const STORE_SYMBOL = Symbol.for('next-cache-lens.event-store.v1')
type GlobalWithStore = typeof globalThis & { [STORE_SYMBOL]?: CacheLensEventStore }

export function getCacheLensStore(): CacheLensEventStore {
  const target = globalThis as GlobalWithStore
  if (!target[STORE_SYMBOL]) target[STORE_SYMBOL] = new CacheLensEventStore()
  return target[STORE_SYMBOL]
}

export function resetGlobalCacheLensStoreForTests(): void {
  const target = globalThis as GlobalWithStore
  delete target[STORE_SYMBOL]
}
