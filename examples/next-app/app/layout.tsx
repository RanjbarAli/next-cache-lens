import type { Metadata } from 'next'
import { CacheLens } from 'next-cache-lens/devtools'
import './globals.css'

export const metadata: Metadata = {
  title: 'Next Cache Lens example',
  description: 'A small Cache Components application used to teach and test Next Cache Lens.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <CacheLens />
      </body>
    </html>
  )
}
