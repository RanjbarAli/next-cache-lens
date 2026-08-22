# Security and privacy

Next Cache Lens runs locally and has no telemetry, analytics, external service, account, or remote data destination.

## Collected

- Hashed cache identifiers
- Event type and timestamp
- Developer-authored cache tags
- Hit, miss, set, stale, expiry, and invalidation metadata
- Cache lifetime numbers
- Operation duration and opaque cached-stream byte size
- Best-effort sanitized source location from optional tracing

## Never collected or exposed

- Cached payload values or stream chunks
- Cache arguments or raw framework cache keys
- Cookies, authorization headers, request bodies, or session tokens
- Environment variables, credentials, passwords, or database secrets
- Absolute home-directory paths

Metadata accepts only bounded primitive values. Sensitive key names and secret-shaped string values are redacted. Prototype-pollution keys, nested objects, and arrays are dropped. React renders text rather than raw HTML.

## Endpoint controls

- Always returns 404 in production in version 0.1
- JSON mutation bodies only, limited to 4 KiB
- Same-origin browser expectation and `Sec-Fetch-Site` cross-site rejection
- Fixed operations only: tag revalidation and event reset
- Tags limited to the Next.js 256-character maximum and rejected when they contain controls
- No arbitrary code, cache-value read, cache-key lookup, or generic execution API
- `Cache-Control: no-store` and `X-Content-Type-Options: nosniff`

The endpoint has no production opt-in. Do not proxy or recreate it in production.

## Storage bounds

Events are kept in a ring buffer of 100-10,000 items. Cache storage is bounded by both count and byte size. Nothing is written to disk by Lens.

## Reporting a vulnerability

Follow [SECURITY.md](../SECURITY.md) and do not include real secrets in a report or reproduction.
