import { readFile } from 'node:fs/promises'
import { gzipSync } from 'node:zlib'
import { transform } from 'esbuild'

const source = await readFile(new URL('../dist/devtools.js', import.meta.url), 'utf8')
const minified = await transform(source, { minify: true, loader: 'js', target: 'es2022' })
const rawBytes = Buffer.byteLength(source)
const minifiedBytes = Buffer.byteLength(minified.code)
const gzipBytes = gzipSync(minified.code, { level: 9 }).byteLength

process.stdout.write(
  `${JSON.stringify({ rawBytes, minifiedBytes, gzipBytes, excludesPeerReact: true }, null, 2)}\n`,
)
