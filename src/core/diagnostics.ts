import type { CacheEntrySnapshot, CacheLensDiagnostic, CacheTagSnapshot } from '../types/index.js'

export function createDiagnostics(
  entries: CacheEntrySnapshot[],
  tags: CacheTagSnapshot[],
): CacheLensDiagnostic[] {
  const diagnostics: CacheLensDiagnostic[] = []

  for (const entry of entries) {
    const attempts = entry.hitCount + entry.missCount
    if (entry.tags.length === 0) {
      diagnostics.push({
        code: 'ENTRY_WITHOUT_TAGS',
        severity: 'info',
        title: 'Entry has no observed tags',
        description: 'Add cacheTag when this entry needs targeted invalidation.',
        entryId: entry.id,
      })
    }
    if (attempts >= 5 && entry.hitCount / attempts < 0.2) {
      diagnostics.push({
        code: 'LOW_HIT_RATE',
        severity: 'warning',
        title: 'Low observed hit rate',
        description: `${entry.hitCount} of ${attempts} observed lookups were hits.`,
        entryId: entry.id,
      })
    }
    if (entry.setCount >= 5 && entry.setCount > entry.hitCount) {
      diagnostics.push({
        code: 'REPEATED_RECREATION',
        severity: 'warning',
        title: 'Entry is repeatedly recreated',
        description: `Observed ${entry.setCount} sets and ${entry.hitCount} hits.`,
        entryId: entry.id,
      })
    }
    if (entry.revalidateSeconds === undefined && entry.expireSeconds === undefined) {
      diagnostics.push({
        code: 'LIFETIME_UNAVAILABLE',
        severity: 'info',
        title: 'Lifetime metadata unavailable',
        description:
          'Use lensCacheLife for explicit call-site tracing, or inspect a later SET event.',
        entryId: entry.id,
      })
    }
  }

  for (const tag of tags) {
    if (tag.invalidationCount >= 5) {
      diagnostics.push({
        code: 'FREQUENT_INVALIDATION',
        severity: 'warning',
        title: 'Tag is invalidated frequently',
        description: `Observed ${tag.invalidationCount} invalidations for this tag.`,
        tag: tag.name,
      })
    }
    if (tag.entryIds.length >= 20) {
      diagnostics.push({
        code: 'HIGH_IMPACT_TAG',
        severity: 'info',
        title: 'Tag affects many entries',
        description: `This tag is related to ${tag.entryIds.length} observed entries.`,
        tag: tag.name,
      })
    }
  }

  return diagnostics.slice(0, 100)
}
