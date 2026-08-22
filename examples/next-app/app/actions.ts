'use server'

import { lensUpdateTag } from 'next-cache-lens/trace'

export async function refreshProducts(): Promise<void> {
  lensUpdateTag('products')
}
