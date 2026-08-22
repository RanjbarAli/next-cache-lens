import { createHash } from 'node:crypto'

export function hashCacheKey(cacheKey: string): string {
  return `cache_${createHash('sha256').update(cacheKey).digest('hex').slice(0, 16)}`
}
