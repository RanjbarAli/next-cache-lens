const PREFIX = '[Next Cache Lens]'

export function assertSupportedNextVersion(version: string): void {
  const match = /^(\d+)\.(\d+)\.(\d+)/.exec(version)
  if (!match?.[1]) {
    throw new Error(`${PREFIX} Could not parse the installed Next.js version: ${version}`)
  }
  const major = Number(match[1])
  if (major !== 16) {
    throw new Error(
      `${PREFIX} Next.js ${version} is unsupported. Install Next.js >=16.0.0 <17, which provides the public Cache Components handler API used by this package.`,
    )
  }
}
