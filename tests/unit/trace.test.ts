import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getCacheLensStore, resetGlobalCacheLensStoreForTests } from '../../src/core/event-store.js'

const natives = vi.hoisted(() => ({
  cacheTag: vi.fn(),
  cacheLife: vi.fn(),
  updateTag: vi.fn(),
  revalidateTag: vi.fn(),
}))
vi.mock('next/cache.js', () => natives)

import {
  lensCacheLife,
  lensCacheTag,
  lensRevalidateTag,
  lensUpdateTag,
} from '../../src/trace/index.js'

describe('tracing helpers', () => {
  beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'development')
    resetGlobalCacheLensStoreForTests()
    for (const mock of Object.values(natives)) mock.mockReset()
  })

  it('delegates cacheTag without changing arguments', () => {
    lensCacheTag('products', 'catalog')
    expect(natives.cacheTag).toHaveBeenCalledWith('products', 'catalog')
    expect(getCacheLensStore().snapshot().events[0]).toMatchObject({
      type: 'TAG',
      tags: ['products', 'catalog'],
    })
  })

  it('records only safe lifetime configuration', () => {
    lensCacheLife({ stale: 30, revalidate: 60, expire: 300 })
    expect(natives.cacheLife).toHaveBeenCalledWith({ stale: 30, revalidate: 60, expire: 300 })
    expect(getCacheLensStore().snapshot().events[0]?.metadata).toMatchObject({
      revalidateSeconds: 60,
    })
  })

  it('defaults revalidateTag to the recommended max profile', () => {
    lensRevalidateTag('products')
    expect(natives.revalidateTag).toHaveBeenCalledWith('products', 'max')
  })

  it('preserves updateTag return values', () => {
    natives.updateTag.mockReturnValue('native-result')
    expect(lensUpdateTag('products')).toBe('native-result')
  })

  it('does not catch native errors', () => {
    natives.cacheTag.mockImplementation(() => {
      throw new Error('native failure')
    })
    expect(() => lensCacheTag('products')).toThrow('native failure')
    expect(getCacheLensStore().snapshot().events).toEqual([])
  })

  it('has zero collection behavior in production', () => {
    vi.stubEnv('NODE_ENV', 'production')
    lensRevalidateTag('products')
    expect(natives.revalidateTag).toHaveBeenCalled()
    expect(getCacheLensStore().snapshot().events).toEqual([])
  })
})
