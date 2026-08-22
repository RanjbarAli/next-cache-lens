import { describe, expect, it } from 'vitest'
import { hashCacheKey } from '../../src/core/hash.js'
import {
  captureSourceLocation,
  sanitizeError,
  sanitizeMetadata,
  sanitizeString,
  validateTag,
} from '../../src/core/sanitize.js'

describe('privacy sanitization', () => {
  it('creates stable opaque cache identifiers', () => {
    expect(hashCacheKey('private:user:123')).toBe(hashCacheKey('private:user:123'))
    expect(hashCacheKey('private:user:123')).not.toContain('user')
    expect(hashCacheKey('a')).not.toBe(hashCacheKey('b'))
  })

  it('redacts sensitive metadata keys', () => {
    expect(
      sanitizeMetadata({ authorization: 'Bearer abc', password: 'hello', safe: 'visible' }),
    ).toEqual({ authorization: '[redacted]', password: '[redacted]', safe: 'visible' })
  })

  it('drops nested values, arrays, and prototype pollution keys', () => {
    const input = JSON.parse(
      '{"safe":true,"nested":{"secret":"x"},"array":[1],"__proto__":"bad"}',
    ) as unknown
    expect(sanitizeMetadata(input)).toEqual({ safe: true })
  })

  it('redacts secret-shaped values even under safe keys', () => {
    expect(sanitizeString('Bearer abc.def.ghi')).toBe('[redacted]')
    expect(sanitizeString('api_key=abcdef')).toBe('[redacted]')
  })

  it('bounds strings and replaces controls', () => {
    expect(sanitizeString(`ok\u0001${'x'.repeat(250)}`)).toHaveLength(200)
    expect(sanitizeString('ok\u0001')).toBe('ok�')
  })

  it('never returns an error stack', () => {
    const error = new Error('safe failure')
    expect(sanitizeError(error)).toBe('safe failure')
    expect(sanitizeError(error)).not.toContain('sanitize.test')
  })

  it('redacts absolute path prefixes from stack locations', () => {
    const stack = 'Error\n    at load (/home/person/project/app/products/actions.ts:42:3)'
    expect(captureSourceLocation(stack)).toBe('app/products/actions.ts:42')
  })

  it.each(['products', 'product:42', 'x'.repeat(256)])('accepts valid tag %s', (tag) => {
    expect(validateTag(tag)).toBe(true)
  })

  it.each(['', 'x'.repeat(257), 'bad\ntag', 12, null])('rejects malformed tag %s', (tag) => {
    expect(validateTag(tag)).toBe(false)
  })
})
