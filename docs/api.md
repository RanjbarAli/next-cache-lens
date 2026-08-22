# API reference

## `withCacheLens(nextConfig, options?)`

Subpath: `next-cache-lens/config`

Returns the original configuration in production or when `enabled: false`. In development it requires `cacheComponents: true`, validates Next.js 16, rejects existing custom `cacheHandlers`, and configures the Lens handler for `use cache` and `use cache: remote`.

```ts
type CacheLensConfigOptions = {
  enabled?: boolean
}
```

## `<CacheLens />`

Subpath: `next-cache-lens/devtools`

```ts
type CacheLensProps = {
  endpoint?: string
  enabled?: boolean
  position?: 'bottom-right' | 'bottom-left'
  pollInterval?: number
  theme?: 'system' | 'light' | 'dark'
}
```

Defaults are `/api/cache-lens`, enabled in development, `bottom-right`, 1500 ms, and `system`. Poll intervals below 500 ms are clamped. Rendering is disabled in production.

## `createCacheLensRoute(options?)`

Subpath: `next-cache-lens/server`

```ts
type CacheLensRouteOptions = {
  enabled?: boolean
  maxEvents?: number
}
```

Returns typed `GET` and `POST` Route Handlers. `maxEvents` is clamped to 100-10,000 (default 1,000). POST operations:

```json
{ "operation": "reset" }
```

```json
{ "operation": "revalidate-tag", "tag": "products" }
```

Manual revalidation calls the public `revalidateTag(tag, "max")` API, which is supported in Route Handlers. It does not call the Server Action-only `updateTag` API.

## Tracing helpers

Subpath: `next-cache-lens/trace`

- `lensCacheTag(...tags)` delegates to `cacheTag`.
- `lensCacheLife(profile)` delegates to `cacheLife`.
- `lensUpdateTag(tag)` delegates to `updateTag`; Server Actions only.
- `lensRevalidateTag(tag, profile = "max")` delegates to `revalidateTag`.

Native return values and errors are preserved. Collection is skipped in production.

## Types

Subpath: `next-cache-lens/types`

Exports `CacheLensEvent`, `CacheEntrySnapshot`, `CacheTagSnapshot`, `CacheLensStatistics`, `CacheLensDiagnostic`, `CacheLensSnapshot`, and typed API response models. Optional properties mean unavailable, not zero.
