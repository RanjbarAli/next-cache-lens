# Contributing

Thank you for helping make Next Cache Lens more accurate and useful.

## Local setup

Requirements are Node.js 20.9+ and pnpm 10.

```bash
cd next-cache-lens
corepack enable
pnpm install
```

Clone your fork using the URL shown by GitHub before running these commands.

Common commands:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm test:integration
pnpm exec playwright install chromium
pnpm test:e2e
pnpm build
pnpm validate
pnpm check
```

Run the example with `pnpm --dir examples/next-app dev`.

## Expectations

- Base features only on documented public Next.js APIs.
- Add unit coverage and a real Next.js integration or browser test when behavior crosses that boundary.
- Preserve the no-payload, no-telemetry security model.
- Do not add private `next/dist` imports, framework monkey patches, or unbounded data structures.
- Keep public APIs small and update the API and compatibility documentation with changes.
- Run `pnpm check`, relevant integration/E2E tests, and package validation before submitting.

Bug reports and fixtures must not contain credentials, cookies, production cache values, or private user data.
