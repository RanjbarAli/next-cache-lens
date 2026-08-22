import { connection } from 'next/server'
import { Suspense } from 'react'
import { refreshProducts } from './actions'
import { getProductCount, getProducts } from './data'

export default function Page() {
  return (
    <main>
      <h1>Next Cache Lens example</h1>
      <p>
        Open <strong>Cache</strong> in the lower-right corner to inspect the two cached functions on
        this page.
      </p>
      <Suspense fallback={<section className="card">Loading the catalog…</section>}>
        <Catalog />
      </Suspense>
    </main>
  )
}

async function Catalog() {
  await connection()
  const [products, count] = await Promise.all([getProducts(), getProductCount()])
  return (
    <section className="card">
      <h2>Product catalog ({count})</h2>
      <ul>
        {products.map((product) => (
          <li key={product.id}>
            {product.name} <small>· {product.category}</small>
          </li>
        ))}
      </ul>
      <form action={refreshProducts}>
        <button type="submit">Invalidate products</button>
      </form>
    </section>
  )
}
