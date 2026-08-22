import { getCacheLensStore } from '../core/event-store.js'
import { validateTag } from '../core/sanitize.js'
import type { CacheLensApiError, CacheLensApiResponse } from '../types/index.js'

const PREFIX = '[Next Cache Lens]'
const MAX_BODY_BYTES = 4_096

export interface CacheLensRouteOptions {
  enabled?: boolean
  maxEvents?: number
}

export interface CacheLensRouteHandlers {
  GET: (request: Request) => Promise<Response>
  POST: (request: Request) => Promise<Response>
}

export function createCacheLensRoute(options: CacheLensRouteOptions = {}): CacheLensRouteHandlers {
  if (options.maxEvents !== undefined) getCacheLensStore().configure(options.maxEvents)

  return {
    GET: (request) => Promise.resolve(createSnapshotResponse(request, options)),
    POST: async (request) => {
      if (!routeEnabled(options)) return disabledResponse()
      if (!isSameOrigin(request)) {
        return errorResponse(403, 'CROSS_ORIGIN', `${PREFIX} Cross-origin mutations are rejected.`)
      }
      if (!request.headers.get('content-type')?.toLowerCase().includes('application/json')) {
        return errorResponse(415, 'UNSUPPORTED_MEDIA_TYPE', `${PREFIX} Expected application/json.`)
      }
      const declaredLength = Number(request.headers.get('content-length') ?? 0)
      if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
        return errorResponse(413, 'BODY_TOO_LARGE', `${PREFIX} Request body exceeds 4096 bytes.`)
      }

      let rawBody: string
      try {
        rawBody = await request.text()
      } catch {
        return errorResponse(400, 'MALFORMED_BODY', `${PREFIX} Request body could not be read.`)
      }
      if (new TextEncoder().encode(rawBody).byteLength > MAX_BODY_BYTES) {
        return errorResponse(413, 'BODY_TOO_LARGE', `${PREFIX} Request body exceeds 4096 bytes.`)
      }

      let body: unknown
      try {
        body = JSON.parse(rawBody) as unknown
      } catch {
        return errorResponse(400, 'MALFORMED_JSON', `${PREFIX} Request body is not valid JSON.`)
      }
      if (!isRecord(body) || typeof body.operation !== 'string') {
        return errorResponse(
          400,
          'INVALID_OPERATION',
          `${PREFIX} A supported operation is required.`,
        )
      }

      if (body.operation === 'reset') {
        getCacheLensStore().reset()
        return successSnapshot()
      }
      if (body.operation === 'revalidate-tag') {
        if (!validateTag(body.tag)) {
          return errorResponse(
            400,
            'INVALID_TAG',
            `${PREFIX} Tag must be 1-256 characters and contain no control characters.`,
          )
        }
        const { revalidateTag } = await import('next/cache.js')
        revalidateTag(body.tag, 'max')
        getCacheLensStore().record({
          type: 'REVALIDATE',
          tags: [body.tag],
          source: 'server-route',
          metadata: { profile: 'max' },
        })
        return successSnapshot()
      }

      return errorResponse(400, 'INVALID_OPERATION', `${PREFIX} Unsupported operation.`)
    },
  }
}

function createSnapshotResponse(request: Request, options: CacheLensRouteOptions): Response {
  if (!routeEnabled(options)) return disabledResponse()
  const url = new URL(request.url)
  const since = parseInteger(url.searchParams.get('since'), 0, Number.MAX_SAFE_INTEGER)
  const limit = parseInteger(url.searchParams.get('limit'), 1, 1_000)
  if (since === null || limit === null) {
    return errorResponse(400, 'INVALID_QUERY', `${PREFIX} Invalid snapshot query parameters.`)
  }
  return jsonResponse({
    ok: true,
    snapshot: getCacheLensStore().snapshot({
      ...(since !== undefined ? { since } : {}),
      ...(limit !== undefined ? { limit } : {}),
    }),
  })
}

function routeEnabled(options: CacheLensRouteOptions): boolean {
  return process.env.NODE_ENV !== 'production' && options.enabled !== false
}

function isSameOrigin(request: Request): boolean {
  const site = request.headers.get('sec-fetch-site')
  if (site === 'cross-site') return false
  const origin = request.headers.get('origin')
  if (!origin) return true
  try {
    return new URL(origin).origin === new URL(request.url).origin
  } catch {
    return false
  }
}

function parseInteger(
  value: string | null,
  minimum: number,
  maximum: number,
): number | undefined | null {
  if (value === null) return undefined
  if (!/^\d+$/.test(value)) return null
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) return null
  return parsed
}

function isRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value) as unknown
  return prototype === Object.prototype || prototype === null
}

function successSnapshot(): Response {
  return jsonResponse({ ok: true, snapshot: getCacheLensStore().snapshot() })
}

function disabledResponse(): Response {
  return errorResponse(
    404,
    'DISABLED',
    `${PREFIX} The development endpoint is disabled outside development mode.`,
  )
}

function errorResponse(status: number, code: string, message: string): Response {
  const body: CacheLensApiError = { ok: false, error: { code, message } }
  return jsonResponse(body, status)
}

function jsonResponse(body: CacheLensApiResponse, status = 200): Response {
  return Response.json(body, {
    status,
    headers: {
      'Cache-Control': 'no-store, max-age=0',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}
