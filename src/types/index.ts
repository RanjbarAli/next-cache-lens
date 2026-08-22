export type CacheEventType =
  | 'GET'
  | 'SET'
  | 'HIT'
  | 'MISS'
  | 'STALE'
  | 'REVALIDATE'
  | 'INVALIDATE'
  | 'EXPIRE'
  | 'TAG'
  | 'LIFE'
  | 'ERROR'

export type CacheEntryStatus = 'fresh' | 'stale' | 'invalidated' | 'expired' | 'unknown'

export type CacheEventSource = 'cache-handler' | 'trace-helper' | 'server-route'

export type SafePrimitive = string | number | boolean | null

export interface CacheLensEvent {
  id: string
  sequence: number
  timestamp: number
  type: CacheEventType
  cacheId?: string
  tags?: string[]
  durationMs?: number
  source: CacheEventSource
  sourceLocation?: string
  metadata?: Readonly<Record<string, SafePrimitive>>
}

export interface CacheEntrySnapshot {
  id: string
  status: CacheEntryStatus
  tags: string[]
  createdAt?: number
  lastAccessedAt?: number
  expiresAt?: number
  staleAt?: number
  hitCount: number
  missCount: number
  setCount: number
  invalidationCount: number
  lastInvalidatedAt?: number
  lastInvalidatedBy?: string
  source?: CacheEventSource
  sourceLocation?: string
  revalidateSeconds?: number
  expireSeconds?: number
}

export interface CacheTagSnapshot {
  name: string
  entryIds: string[]
  invalidationCount: number
  lastInvalidatedAt?: number
}

export interface CacheLensStatistics {
  entries: number
  hits: number
  misses: number
  hitRate?: number
  sets: number
  invalidations: number
  revalidations: number
  activeTags: number
  eventCount: number
}

export type DiagnosticCode =
  | 'ENTRY_WITHOUT_TAGS'
  | 'LOW_HIT_RATE'
  | 'FREQUENT_INVALIDATION'
  | 'HIGH_IMPACT_TAG'
  | 'REPEATED_RECREATION'
  | 'LIFETIME_UNAVAILABLE'

export interface CacheLensDiagnostic {
  code: DiagnosticCode
  severity: 'info' | 'warning'
  title: string
  description: string
  entryId?: string
  tag?: string
}

export interface CacheLensSnapshot {
  generatedAt: number
  cursor: number
  events: CacheLensEvent[]
  entries: CacheEntrySnapshot[]
  tags: CacheTagSnapshot[]
  statistics: CacheLensStatistics
  diagnostics: CacheLensDiagnostic[]
  truncated: boolean
}

export interface CacheLensApiError {
  ok: false
  error: {
    code: string
    message: string
  }
}

export interface CacheLensApiSuccess {
  ok: true
  snapshot: CacheLensSnapshot
}

export type CacheLensApiResponse = CacheLensApiSuccess | CacheLensApiError
