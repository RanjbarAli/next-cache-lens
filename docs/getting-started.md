# Getting started

## Requirements

- Next.js 16.x using the App Router
- Cache Components enabled
- React and React DOM 19.x
- Node.js 20.9 or newer

Install as a development dependency:

```bash
pnpm add -D next-cache-lens
```

## 1. Configure Next.js

```ts
import type { NextConfig } from 'next'
import { withCacheLens } from 'next-cache-lens/config'

const nextConfig: NextConfig = { cacheComponents: true }
export default withCacheLens(nextConfig)
```

In development, this assigns the observable in-memory handler to the public `default` and `remote` Cache Components slots. In production, it returns the original object unchanged.

If the application already has `cacheHandlers`, Lens throws instead of overwriting them. Keep the existing handler and use [optional tracing](#optional-tracing), or remove that configuration only if Lens should own local development caching.

## 2. Add the endpoint

Create `app/api/cache-lens/route.ts`:

```ts
import { createCacheLensRoute } from 'next-cache-lens/server'

export const { GET, POST } = createCacheLensRoute()
```

The route returns 404 in production. GET reads snapshots. POST accepts only `reset` and `revalidate-tag`, with bounded JSON and same-origin validation.

## 3. Mount DevTools

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

The launcher opens from the bottom-right by default. Use `Cmd/Ctrl + Shift + L` to toggle it. Polling starts only while the panel is open and pauses when the document is hidden.

For a custom route path, set the same client endpoint:

```tsx
<CacheLens endpoint="/internal/cache-lens" position="bottom-left" />
```

## 4. Generate activity

Use standard Cache Components APIs:

```ts
import { cacheLife, cacheTag } from 'next/cache'

export async function getProducts() {
  'use cache'
  cacheTag('products')
  cacheLife('minutes')
  return database.products.findMany()
}
```

Open a page that calls the function twice to observe an initial miss and set followed by hits. Invalidating `products` in a Server Action or Route Handler produces tag activity through the handler.

## Optional tracing

Tracing wrappers delegate to native Next.js functions and record safe call metadata after the native call succeeds:

```ts
import {
  lensCacheLife,
  lensCacheTag,
  lensRevalidateTag,
  lensUpdateTag,
} from 'next-cache-lens/trace'
```

Use `lensUpdateTag` only in a Server Action. Use `lensRevalidateTag` in a Server Action or Route Handler. The wrappers do not alter invalidation semantics.

## Removal

Remove `<CacheLens />`, delete its Route Handler, unwrap the Next.js config, remove tracing imports, then uninstall the package. Lens does not persist files or external data.
