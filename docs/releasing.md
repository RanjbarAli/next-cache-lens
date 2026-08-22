# Releasing

## Before release

1. Confirm the npm version is not already published: `npm view next-cache-lens@<version>`.
2. Move the changelog entry from Unreleased and update the package version.
3. Run the complete release checks:

```bash
pnpm install --frozen-lockfile
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm test:integration
pnpm test:e2e
pnpm build
pnpm build:example
pnpm validate:package
npm pack --dry-run
pnpm test:consumer
```

4. Review the exact tarball with `npm pack --dry-run`.
5. Commit, tag `v<version>`, and create a GitHub release.

## Trusted publishing

The release workflow is prepared for npm trusted publishing. Before enabling it, set
`repository.url` in `package.json` to the exact public GitHub repository URL. In npm package
settings, add the GitHub owner, repository name, `release.yml` workflow filename, `npm`
environment, and allow `npm publish`. The workflow uses OIDC and `id-token: write`; no npm
token belongs in repository settings or files. npm automatically creates provenance for eligible
public packages published through trusted publishing.

After trusted publishing is configured, publishing a GitHub release runs the verified workflow and `npm publish --access public`.

The package must exist on npm before its package settings are available. For the deliberate first
release, authenticate interactively and run:

```bash
npm login
npm publish --access public
```

After configuring trusted publishing, create the matching GitHub release. The release workflow is
idempotent for the locally bootstrapped version and publishes later, previously unpublished
versions through OIDC.

Never commit an npm token or place one in `.npmrc`.
