// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CacheLens } from '../../src/devtools/index.js'

describe('CacheLens', () => {
  beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'development')
    window.localStorage.clear()
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise<Response>(() => undefined)),
    )
  })
  afterEach(() => {
    cleanup()
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('renders an accessible launcher and opens the panel', () => {
    render(<CacheLens />)
    fireEvent.click(screen.getByRole('button', { name: 'Open Next Cache Lens' }))
    expect(screen.getByRole('dialog', { name: 'Next Cache Lens developer tools' })).toBeVisible()
    expect(screen.getAllByRole('tab')).toHaveLength(6)
  })

  it('persists open state locally', () => {
    render(<CacheLens />)
    fireEvent.click(screen.getByRole('button', { name: 'Open Next Cache Lens' }))
    expect(window.localStorage.getItem('next-cache-lens:panel-open')).toBe('true')
    fireEvent.click(screen.getByRole('button', { name: 'Close Cache Lens' }))
    expect(window.localStorage.getItem('next-cache-lens:panel-open')).toBe('false')
  })

  it('supports the keyboard shortcut and Escape', () => {
    render(<CacheLens />)
    fireEvent.keyDown(window, { key: 'L', shiftKey: true, ctrlKey: true })
    expect(screen.getByRole('dialog')).toBeVisible()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('does not capture the shortcut while typing', () => {
    render(
      <>
        <input aria-label="Application input" />
        <CacheLens />
      </>,
    )
    const input = screen.getByLabelText('Application input')
    fireEvent.keyDown(input, { key: 'L', shiftKey: true, ctrlKey: true })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('renders nothing in production', () => {
    vi.stubEnv('NODE_ENV', 'production')
    const { container } = render(<CacheLens />)
    expect(container).toBeEmptyDOMElement()
  })
})
