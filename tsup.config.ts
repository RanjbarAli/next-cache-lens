import { defineConfig } from 'tsup'

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    config: 'src/config/index.ts',
    server: 'src/server/index.ts',
    trace: 'src/trace/index.ts',
    types: 'src/types/index.ts',
    'cache-handler': 'src/cache-handler/index.ts',
  },
  format: ['esm'],
  target: 'es2022',
  platform: 'neutral',
  dts: true,
  splitting: false,
  sourcemap: false,
  clean: true,
  treeshake: true,
  minify: false,
  external: ['next', 'next/cache.js', 'react', 'react-dom', 'server-only'],
})
