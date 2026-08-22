import { lensCacheLife, lensCacheTag } from 'next-cache-lens/trace'

const products = [
  { id: 'field-notes', name: 'Field Notes', category: 'stationery' },
  { id: 'desk-timer', name: 'Desk Timer', category: 'tools' },
  { id: 'task-lamp', name: 'Task Lamp', category: 'lighting' },
] as const

export async function getProducts() {
  'use cache'
  lensCacheTag('products', 'catalog')
  lensCacheLife({ stale: 30, revalidate: 60, expire: 300 })
  return Promise.resolve(products)
}

export async function getProductCount() {
  'use cache'
  lensCacheTag('products', 'products:count')
  lensCacheLife('minutes')
  return Promise.resolve(products.length)
}
