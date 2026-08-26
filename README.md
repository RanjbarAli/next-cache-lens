# Next Cache Lens

Visual cache observability and debugging for Next.js.

GitHub: [RanjbarAli/next-cache-lens](https://github.com/RanjbarAli/next-cache-lens)

Next Cache Lens is a lightweight developer tool for understanding cache behavior in Next.js applications. It shows observed cache activity, tags, invalidations, hit rates, lifetimes, and evidence-backed relationships without exposing cached values or relying on private Next.js internals.

## Why

Cache Components are powerful, but cache keys, handler activity, and tag relationships are otherwise difficult to inspect as a system. Next Cache Lens connects to the public Next.js `cacheHandlers` contract and turns that metadata into a compact browser developer tool.

## Features

- Real hit, miss, set, stale, expiry, and tag-invalidation events from a public cache handler
- Hashed identifiers; cached payloads, arguments, cookies, headers, and secrets are never sent to the UI
- Entry, tag, event, dependency graph, and deterministic diagnostics views
- Search, filters, sorting, entry details, and development-only tag revalidation
- Bounded in-memory storage and polling only while the panel is open
- Optional native API tracing for call-site and cache-life context
- Keyboard shortcut (`Cmd/Ctrl + Shift + L`), light/dark/system themes, and accessible controls
- Disabled in production by default, including the HTTP endpoint

The measured client module is 25,645 bytes minified and 7,434 bytes with gzip (React excluded as a peer dependency).

## Installation

```bash
pnpm add -D next-cache-lens
```

```bash
npm install -D next-cache-lens
```

## Quick start

Enable Cache Components and the Lens handler:

```ts
// next.config.ts
import type { NextConfig } from 'next'
import { withCacheLens } from 'next-cache-lens/config'

const nextConfig: NextConfig = {
  cacheComponents: true,
}

export default withCacheLens(nextConfig)
```

Add a development endpoint at `app/api/cache-lens/route.ts`:

```ts
import { createCacheLensRoute } from 'next-cache-lens/server'

export const { GET, POST } = createCacheLensRoute()
```

Mount the UI in the root layout:

```tsx
import { CacheLens } from 'next-cache-lens/devtools'

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <CacheLens />
      </body>
    </html>
  )
}
```

Run `next dev`, use a cached route or function, then open **Cache** in the corner.

See [Getting started](docs/getting-started.md) for options and a complete walkthrough.

## What you can inspect

The handler exposes cache key hashes, tags, timestamps, lifetimes, hit/miss counts, sets, and tag updates. Lens never serializes the cached stream. Route attribution and original function arguments are shown as unknown because the public handler API does not provide them.

## Optional tracing

Native Next.js APIs work normally. Replace individual calls only when richer tracing is useful:

```ts
import { lensCacheLife, lensCacheTag } from 'next-cache-lens/trace'

export async function getProducts() {
  'use cache'
  lensCacheTag('products')
  lensCacheLife('minutes')
  return database.products.findMany()
}
```

`lensUpdateTag` is Server Action-only, exactly like `updateTag`. `lensRevalidateTag` defaults to the recommended `"max"` profile and works where Next.js supports `revalidateTag`. Lens delegates first and never hides a Next.js error.

## Security and privacy

No telemetry, analytics, accounts, cloud service, or external network destination is present. The endpoint accepts bounded same-origin JSON mutations in development only. Cached values and sensitive request data are not collected. Read [Security and privacy](docs/security-and-privacy.md).

## Production

`withCacheLens`, `<CacheLens />`, and `createCacheLensRoute()` are disabled when `NODE_ENV=production`. Version 0.1 does not provide a production opt-in.

## Compatibility

Next.js 16.x, React 19.x, and Node.js 20.9 or newer are supported. See the exact [compatibility contract](docs/compatibility.md).

## API

- `next-cache-lens/config`: `withCacheLens`, `isCacheLensEnabled`
- `next-cache-lens/devtools`: `CacheLens`
- `next-cache-lens/server`: `createCacheLensRoute`
- `next-cache-lens/trace`: `lensCacheTag`, `lensCacheLife`, `lensUpdateTag`, `lensRevalidateTag`
- `next-cache-lens/types`: public snapshots, events, statistics, diagnostics, and API response types

See [API reference](docs/api.md).

## Limitations

- Only Cache Components activity visible through public custom handler methods can be inspected.
- Existing `cacheHandlers` are never overwritten; use optional tracing or choose one handler integration.
- `use cache: private` has no configurable server handler and cannot be inspected.
- Route association and original arguments are unavailable through the public handler API.
- Source information from normal JavaScript stacks is best-effort and can be unknown after compilation.
- The in-memory Lens handler is per Next.js process and does not replace a distributed remote cache.

## Troubleshooting

See [Troubleshooting](docs/troubleshooting.md).

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT
