import { defineConfig } from 'tsup'

export default defineConfig({
  entry: { devtools: 'src/devtools/index.ts' },
  format: ['esm'],
  target: 'es2022',
  platform: 'browser',
  dts: true,
  splitting: false,
  sourcemap: false,
  clean: false,
  treeshake: false,
  minify: false,
  banner: { js: "'use client';" },
  external: ['react', 'react-dom'],
})
