import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { CacheLensApiSuccess } from '../../src/types/index.js'
import { runPnpm, startExampleServer, type RunningNextServer } from '../helpers/next-server.js'

let server: RunningNextServer

describe('real Next.js application integration', () => {
  beforeAll(async () => {
    await runPnpm(['build'])
    await runPnpm(['--dir', 'examples/next-app', 'build'])
    server = await startExampleServer()
  })

  afterAll(async () => {
    await server?.stop()
  })

  it('builds and serves the package through documented subpath exports', async () => {
    const response = await fetch(server.url)
    expect(response.status).toBe(200)
    expect(await response.text()).toContain('Next Cache Lens example')
  })

  it('loads the custom handler, executes cached functions, and records hits', async () => {
    await fetch(server.url)
    await fetch(server.url)
    const snapshot = await getSnapshot()
    expect(snapshot.snapshot.statistics.entries).toBe(2)
    expect(snapshot.snapshot.statistics.hits).toBeGreaterThanOrEqual(2)
    expect(snapshot.snapshot.statistics.misses).toBeGreaterThanOrEqual(2)
    expect(snapshot.snapshot.tags.map((tag) => tag.name)).toEqual(
      expect.arrayContaining(['products', 'catalog', 'products:count']),
    )
    expect(snapshot.snapshot.entries.every((entry) => entry.id.startsWith('cache_'))).toBe(true)
  })

  it('reflects tag revalidation through the real Route Handler', async () => {
    const response = await fetch(`${server.url}/api/cache-lens`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ operation: 'revalidate-tag', tag: 'products' }),
    })
    expect(response.status).toBe(200)
    const payload = (await response.json()) as CacheLensApiSuccess
    expect(payload.snapshot.events.some((event) => event.type === 'REVALIDATE')).toBe(true)
    expect(
      payload.snapshot.tags.find((tag) => tag.name === 'products')?.invalidationCount,
    ).toBeGreaterThan(0)
  })

  it('preserves unrelated Next.js configuration', () => {
    expect(server.output()).toContain('Cache Components enabled')
    expect(server.output()).not.toContain('Existing custom `cacheHandlers`')
  })
})

async function getSnapshot(): Promise<CacheLensApiSuccess> {
  const response = await fetch(`${server.url}/api/cache-lens`)
  expect(response.status).toBe(200)
  return (await response.json()) as CacheLensApiSuccess
}
