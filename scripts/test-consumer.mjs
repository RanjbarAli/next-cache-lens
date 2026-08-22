import { execFile, spawn } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const temporaryDirectory = await mkdtemp(join(tmpdir(), 'next-cache-lens-consumer-'))
const packageDirectory = resolve('.')
const pnpmExecPath = process.env.npm_execpath

if (!pnpmExecPath) throw new Error('pnpm execution path is unavailable.')

try {
  await run(process.execPath, [pnpmExecPath, 'build'], packageDirectory)
  const packOutput = await run(
    'npm',
    ['pack', '--json', '--ignore-scripts', '--pack-destination', temporaryDirectory],
    packageDirectory,
  )
  const packResult = JSON.parse(packOutput)
  if (!Array.isArray(packResult) || typeof packResult[0]?.filename !== 'string') {
    throw new Error(`Unexpected npm pack response: ${packOutput}`)
  }
  const tarball = join(temporaryDirectory, packResult[0].filename)
  const fixture = join(temporaryDirectory, 'app')
  await writeFixture(fixture, tarball)
  await run('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund'], fixture, 180_000)
  await run('npm', ['run', 'build'], fixture, 180_000)

  const port = await freePort()
  const nextPackageDirectory = join(fixture, 'node_modules', 'next')
  const nextPackage = JSON.parse(await readFile(join(nextPackageDirectory, 'package.json'), 'utf8'))
  if (typeof nextPackage?.bin?.next !== 'string') {
    throw new Error('The installed Next.js package does not declare its documented CLI binary.')
  }
  const nextBinary = join(nextPackageDirectory, nextPackage.bin.next)
  const output = []
  const child = spawn(process.execPath, [nextBinary, 'dev', '--port', String(port)], {
    cwd: fixture,
    env: { ...process.env, NODE_ENV: 'development', NEXT_TELEMETRY_DISABLED: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  child.stdout.on('data', (chunk) => output.push(chunk.toString()))
  child.stderr.on('data', (chunk) => output.push(chunk.toString()))
  try {
    const baseUrl = `http://localhost:${port}`
    await waitFor(`${baseUrl}/api/cache-lens`, child, output)
    const page = await fetch(baseUrl)
    const html = await page.text()
    if (!page.ok || !html.includes('Tarball consumer') || !html.includes('Open Next Cache Lens')) {
      throw new Error(`Tarball consumer did not render the package.\n${output.join('')}`)
    }
    const endpoint = await fetch(`${baseUrl}/api/cache-lens`)
    const endpointBody = await endpoint.json()
    if (!endpoint.ok || endpointBody?.ok !== true) {
      throw new Error(`Tarball consumer endpoint failed.\n${JSON.stringify(endpointBody)}`)
    }
  } finally {
    child.kill('SIGTERM')
    await Promise.race([
      new Promise((resolveExit) => child.once('exit', resolveExit)),
      new Promise((resolveTimeout) => setTimeout(resolveTimeout, 5_000)),
    ])
    if (child.exitCode === null) child.kill('SIGKILL')
  }

  process.stdout.write(
    'Tarball consumer: package install, types, build, runtime, and DevTools PASS\n',
  )
} finally {
  await rm(temporaryDirectory, { recursive: true, force: true })
}

async function writeFixture(directory, tarball) {
  await mkdir(join(directory, 'app', 'api', 'cache-lens'), { recursive: true })
  await writeFile(
    join(directory, 'package.json'),
    `${JSON.stringify(
      {
        name: 'next-cache-lens-tarball-consumer',
        private: true,
        type: 'module',
        scripts: { build: 'next build' },
        dependencies: {
          next: '16.3.2',
          'next-cache-lens': `file:${tarball}`,
          react: '19.2.8',
          'react-dom': '19.2.8',
        },
        devDependencies: {
          '@types/node': '^20.19.33',
          '@types/react': '^19.2.14',
          '@types/react-dom': '^19.2.3',
          typescript: '^5.9.3',
        },
      },
      null,
      2,
    )}\n`,
  )
  await writeFile(
    join(directory, 'next.config.mjs'),
    `import { withCacheLens } from 'next-cache-lens/config'\nexport default withCacheLens({ cacheComponents: true, agentRules: false })\n`,
  )
  await writeFile(
    join(directory, 'app', 'layout.tsx'),
    `import { CacheLens } from 'next-cache-lens/devtools'\nexport default function Layout({ children }: { children: React.ReactNode }) { return <html lang="en"><body>{children}<CacheLens /></body></html> }\n`,
  )
  await writeFile(
    join(directory, 'app', 'page.tsx'),
    `export default function Page() { return <main><h1>Tarball consumer</h1></main> }\n`,
  )
  await writeFile(
    join(directory, 'app', 'api', 'cache-lens', 'route.ts'),
    `import { createCacheLensRoute } from 'next-cache-lens/server'\nexport const { GET, POST } = createCacheLensRoute()\n`,
  )
}

async function run(command, arguments_, cwd, timeout = 120_000) {
  const result = await execFileAsync(command, arguments_, {
    cwd,
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
    timeout,
    maxBuffer: 10 * 1024 * 1024,
  })
  return result.stdout
}

async function freePort() {
  return new Promise((resolvePort, reject) => {
    const server = createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (!address || typeof address === 'string') {
        server.close(() => reject(new Error('Could not allocate a port.')))
        return
      }
      server.close((error) => (error ? reject(error) : resolvePort(address.port)))
    })
  })
}

async function waitFor(endpoint, child, output) {
  const deadline = Date.now() + 60_000
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Consumer server exited.\n${output.join('')}`)
    try {
      const response = await fetch(endpoint, { signal: AbortSignal.timeout(2_000) })
      if (response.ok) return
    } catch {
      // The server is still compiling. The bounded loop below retries.
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 100))
  }
  throw new Error(`Consumer server timed out.\n${output.join('')}`)
}
