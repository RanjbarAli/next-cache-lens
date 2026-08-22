import { defineConfig } from 'tsup'

export default defineConfig({
  entry: {
    config: 'src/config/index.ts',
    'cache-handler': 'src/cache-handler/index.ts',
  },
  format: ['cjs'],
  outExtension: () => ({ js: '.cjs' }),
  target: 'node20',
  platform: 'node',
  dts: true,
  splitting: false,
  sourcemap: false,
  clean: false,
  treeshake: false,
  minify: false,
  external: ['next'],
  esbuildOptions(options) {
    options.logOverride = { 'empty-import-meta': 'silent' }
  },
})
