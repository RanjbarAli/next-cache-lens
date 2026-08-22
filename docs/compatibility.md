# Compatibility

## Supported matrix

| Component          | Supported                                         |
| ------------------ | ------------------------------------------------- |
| Next.js            | `>=16.0.0 <17`                                    |
| Router             | App Router                                        |
| Cache architecture | Cache Components with `cacheComponents: true`     |
| React / React DOM  | `>=19.0.0 <20`                                    |
| Node.js            | `>=20.9.0`                                        |
| Runtime            | Node.js server and Docker                         |
| Module format      | ESM; `next-cache-lens/config` also supports CJS   |
| Static export      | Not supported by custom Cache Components handlers |

The implementation and integration suite currently pin Next.js 16.3.2 and React 19.2.8. Next.js 16 introduced the stable `cacheComponents` flag, `cacheHandlers`, stable `use cache`, and the Server Action-only `updateTag` contract used here.

`use cache` and `use cache: remote` are observable because they use configurable handlers. `use cache: private` is not observable because Next.js explicitly does not provide a custom handler for it.

## Public contracts used

- `cacheComponents` and `cacheHandlers` in `next.config`
- `CacheHandler` methods documented by Next.js
- `cacheTag`, `cacheLife`, `updateTag`, and `revalidateTag` from `next/cache`
- App Router Route Handlers and Server Actions

No runtime import from `next/dist`, private debug flag, or monkey patch is used.

## Existing handlers

Lens cannot safely compose arbitrary storage handlers from only file paths. `withCacheLens` therefore rejects any existing `cacheHandlers` configuration. This prevents silent cache-semantic changes. Optional tracing remains available without `withCacheLens`.
