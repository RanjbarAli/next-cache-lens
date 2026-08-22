import { describe, expect, it } from 'vitest'
import { RingBuffer } from '../../src/core/ring-buffer.js'

describe('RingBuffer', () => {
  it('preserves insertion order', () => {
    const buffer = new RingBuffer<number>(3)
    buffer.push(1)
    buffer.push(2)
    expect(buffer.toArray()).toEqual([1, 2])
  })

  it('evicts the oldest value at capacity', () => {
    const buffer = new RingBuffer<number>(2)
    buffer.push(1)
    buffer.push(2)
    buffer.push(3)
    expect(buffer.toArray()).toEqual([2, 3])
    expect(buffer.length).toBe(2)
  })

  it('can be cleared and reused', () => {
    const buffer = new RingBuffer<string>(2)
    buffer.push('old')
    buffer.clear()
    buffer.push('new')
    expect(buffer.toArray()).toEqual(['new'])
  })

  it.each([0, -1, 1.5, Number.NaN])('rejects invalid capacity %s', (capacity) => {
    expect(() => new RingBuffer(capacity)).toThrow(RangeError)
  })
})
