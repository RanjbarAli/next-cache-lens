import type { NextConfig } from 'next'
import { withCacheLens } from 'next-cache-lens/config'

const nextConfig: NextConfig = {
  cacheComponents: true,
  agentRules: false,
  reactStrictMode: true,
}

export default withCacheLens(nextConfig)
