import { execFile, spawn } from 'node:child_process'
import { createServer } from 'node:net'
import { resolve } from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

export interface RunningNextServer {
  url: string
  output(): string
  stop(): Promise<void>
}

export async function runPnpm(arguments_: string[], timeout = 120_000): Promise<string> {
  const pnpmExecPath = process.env.npm_execpath
  if (!pnpmExecPath) throw new Error('pnpm execution path is unavailable.')
  const result = await execFileAsync(process.execPath, [pnpmExecPath, ...arguments_], {
    cwd: resolve('.'),
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
    timeout,
    maxBuffer: 10 * 1024 * 1024,
  })
  return `${result.stdout}${result.stderr}`
}

export async function startExampleServer(): Promise<RunningNextServer> {
  const port = await getFreePort()
  const pnpmExecPath = process.env.npm_execpath
  if (!pnpmExecPath) throw new Error('pnpm execution path is unavailable.')
  const chunks: string[] = []
  const child = spawn(
    process.execPath,
    [pnpmExecPath, '--dir', 'examples/next-app', 'exec', 'next', 'dev', '--port', String(port)],
    {
      cwd: resolve('.'),
      env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1', NODE_ENV: 'development' },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  )
  child.stdout.on('data', (chunk: Buffer) => chunks.push(chunk.toString()))
  child.stderr.on('data', (chunk: Buffer) => chunks.push(chunk.toString()))
  // Next.js dev treats localhost as its canonical development origin.
  const url = `http://localhost:${port}`

  try {
    await waitForReady(`${url}/api/cache-lens`, child, chunks)
  } catch (error) {
    child.kill('SIGTERM')
    throw error
  }

  return {
    url,
    output: () => chunks.join(''),
    stop: async () => {
      if (child.exitCode !== null) return
      child.kill('SIGTERM')
      await Promise.race([
        new Promise<void>((resolveExit) => child.once('exit', () => resolveExit())),
        new Promise<void>((resolveTimeout) =>
          setTimeout(() => {
            if (child.exitCode === null) child.kill('SIGKILL')
            resolveTimeout()
          }, 5_000),
        ),
      ])
    },
  }
}

async function getFreePort(): Promise<number> {
  return new Promise((resolvePort, reject) => {
    const server = createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (typeof address === 'string' || address === null) {
        server.close(() => reject(new Error('Could not allocate an ephemeral port.')))
        return
      }
      const { port } = address
      server.close((error) => (error ? reject(error) : resolvePort(port)))
    })
  })
}

async function waitForReady(
  endpoint: string,
  child: ReturnType<typeof spawn>,
  chunks: string[],
): Promise<void> {
  const deadline = Date.now() + 60_000
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Next.js exited before becoming ready.\n${chunks.join('')}`)
    }
    try {
      const response = await fetch(endpoint, { signal: AbortSignal.timeout(2_000) })
      if (response.ok) return
    } catch {
      // The server is still compiling. The bounded loop below retries.
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 100))
  }
  throw new Error(`Next.js did not become ready within 60 seconds.\n${chunks.join('')}`)
}
