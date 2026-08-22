import { cacheLife, cacheTag, revalidateTag, updateTag } from 'next/cache.js'
import { getCacheLensStore } from '../core/event-store.js'
import { captureSourceLocation } from '../core/sanitize.js'

export type LensCacheLifeProfile =
  | string
  | {
      stale?: number
      revalidate?: number
      expire?: number
    }

const callCacheLife = cacheLife as (profile: LensCacheLifeProfile) => void

export function lensCacheTag(...tags: Parameters<typeof cacheTag>): void {
  cacheTag(...tags)
  if (development()) {
    const sourceLocation = captureSourceLocation()
    getCacheLensStore().record({
      type: 'TAG',
      tags,
      source: 'trace-helper',
      ...(sourceLocation ? { sourceLocation } : {}),
    })
  }
}

export function lensCacheLife(profile: LensCacheLifeProfile): void {
  callCacheLife(profile)
  if (development()) {
    const sourceLocation = captureSourceLocation()
    getCacheLensStore().record({
      type: 'LIFE',
      source: 'trace-helper',
      ...(sourceLocation ? { sourceLocation } : {}),
      metadata:
        typeof profile === 'string'
          ? { profile }
          : {
              ...(profile.stale !== undefined ? { staleSeconds: profile.stale } : {}),
              ...(profile.revalidate !== undefined
                ? { revalidateSeconds: profile.revalidate }
                : {}),
              ...(profile.expire !== undefined ? { expireSeconds: profile.expire } : {}),
            },
    })
  }
}

export function lensUpdateTag(tag: Parameters<typeof updateTag>[0]): ReturnType<typeof updateTag> {
  const result = updateTag(tag)
  if (development()) {
    const sourceLocation = captureSourceLocation()
    getCacheLensStore().record({
      type: 'INVALIDATE',
      tags: [tag],
      source: 'trace-helper',
      ...(sourceLocation ? { sourceLocation } : {}),
      metadata: { operation: 'updateTag' },
    })
  }
  return result
}

export function lensRevalidateTag(
  tag: Parameters<typeof revalidateTag>[0],
  profile: Parameters<typeof revalidateTag>[1] = 'max',
): ReturnType<typeof revalidateTag> {
  const result = revalidateTag(tag, profile)
  if (development()) {
    const sourceLocation = captureSourceLocation()
    getCacheLensStore().record({
      type: 'REVALIDATE',
      tags: [tag],
      source: 'trace-helper',
      ...(sourceLocation ? { sourceLocation } : {}),
      metadata: {
        operation: 'revalidateTag',
        profile: typeof profile === 'string' ? profile : 'custom',
      },
    })
  }
  return result
}

function development(): boolean {
  return process.env.NODE_ENV !== 'production'
}
