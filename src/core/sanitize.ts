import type { SafePrimitive } from '../types/index.js'

const SENSITIVE_KEY =
  /(?:authorization|cookie|credential|password|secret|session|token|api[-_]?key)/i
const SENSITIVE_VALUE = /(?:bearer\s+[a-z0-9._~+/-]+=*|(?:api|secret|private)[-_]?key\s*[:=])/i
const BLOCKED_KEYS = new Set(['__proto__', 'constructor', 'prototype'])

export function sanitizeString(value: string, maxLength = 200): string {
  const normalized = [...value]
    .map((character) => (isUnsafeControl(character.codePointAt(0) ?? 0) ? '�' : character))
    .join('')
  if (SENSITIVE_VALUE.test(normalized)) return '[redacted]'
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength - 1)}…` : normalized
}

export function sanitizeMetadata(
  input: unknown,
): Readonly<Record<string, SafePrimitive>> | undefined {
  if (!isPlainRecord(input)) return undefined
  const output: Record<string, SafePrimitive> = Object.create(null) as Record<string, SafePrimitive>
  let count = 0

  for (const [rawKey, rawValue] of Object.entries(input)) {
    if (count >= 20) break
    const key = sanitizeString(rawKey, 64)
    if (!key || BLOCKED_KEYS.has(key)) continue
    if (SENSITIVE_KEY.test(key)) {
      output[key] = '[redacted]'
      count += 1
      continue
    }
    if (rawValue === null || typeof rawValue === 'boolean') {
      output[key] = rawValue
      count += 1
      continue
    }
    if (typeof rawValue === 'number') {
      output[key] = Number.isFinite(rawValue) ? rawValue : null
      count += 1
      continue
    }
    if (typeof rawValue === 'string') {
      output[key] = sanitizeString(rawValue)
      count += 1
    }
  }

  return count > 0 ? output : undefined
}

export function sanitizeError(error: unknown): string {
  if (error instanceof Error) return sanitizeString(error.message, 300)
  return sanitizeString(String(error), 300)
}

export function captureSourceLocation(stack = new Error().stack): string | undefined {
  if (!stack) return undefined
  for (const line of stack.split('\n').slice(1)) {
    if (
      line.includes('/node_modules/next-cache-lens/') ||
      line.includes('/dist/trace.js') ||
      line.includes('node:internal') ||
      line.includes('node_modules/next/')
    ) {
      continue
    }
    const match = line.match(/(?:\(|at\s+)(.*?\.(?:[cm]?[jt]sx?)):(\d+):(\d+)\)?$/)
    if (!match?.[1] || !match[2]) continue
    const path = match[1].replaceAll('\\', '/')
    const relative = path.includes('/app/')
      ? `app/${path.split('/app/').at(-1)}`
      : path.includes('/src/')
        ? `src/${path.split('/src/').at(-1)}`
        : path.split('/').slice(-2).join('/')
    return `${relative}:${match[2]}`
  }
  return undefined
}

export function validateTag(value: unknown): value is string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 256) return false
  return [...value].every((character) => {
    const codePoint = character.codePointAt(0) ?? 0
    return codePoint > 31 && codePoint !== 127
  })
}

function isUnsafeControl(codePoint: number): boolean {
  return (
    (codePoint >= 0 && codePoint <= 8) ||
    codePoint === 11 ||
    codePoint === 12 ||
    (codePoint >= 14 && codePoint <= 31) ||
    codePoint === 127
  )
}

function isPlainRecord(input: unknown): input is Record<string, unknown> {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) return false
  const prototype = Object.getPrototypeOf(input) as unknown
  return prototype === Object.prototype || prototype === null
}
