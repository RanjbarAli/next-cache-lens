# Troubleshooting

## DevTools shows no entries

Confirm the cached code actually ran after the development server started. `use cache: private` is not visible to custom handlers. Hard-refresh behavior can also differ from normal navigation in Next.js development.

## Cache Components are disabled

Set `cacheComponents: true` before calling `withCacheLens`. Lens fails rather than silently enabling an application-wide Next.js architecture choice.

## Existing custom cache handler

Lens will not overwrite existing `cacheHandlers`. Remove `withCacheLens` and use optional tracing, or deliberately choose the Lens development handler after evaluating the storage tradeoff.

## Endpoint returns `DISABLED`

The endpoint returns 404 in production or when `enabled: false`. Version 0.1 has no production mode.

## Unsupported Next.js version

Install Next.js 16.x. Earlier versions do not provide the stable Cache Components handler contract used by Lens. Future major versions require compatibility review before the peer range is expanded.

## Panel does not update

Confirm the `endpoint` prop matches the Route Handler path. Polling runs only while the panel is open and the tab is visible. Inspect the visible error in the panel and the endpoint response; errors are not suppressed.

## Tag invalidation is not visible

Use `updateTag` only in a Server Action. Use `revalidateTag(tag, "max")` from a Server Action or Route Handler. The optional Lens wrappers can show the API call immediately; handler updates appear when Next.js invokes its public handler method.

## Source or route is unknown

Route association is not part of the public handler contract. Source extraction is best-effort from ordinary development stacks and may be removed by compilation. Unknown is expected and is not synthesized.

## `use cache: remote` is not durable

The Lens handler is a local development memory handler, not a distributed remote store. If the application depends on a custom durable remote handler, do not replace it; use tracing only.
