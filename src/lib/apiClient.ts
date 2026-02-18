import { readErrorMessage } from '@/lib/http'

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

type HeadersInitLike = HeadersInit | undefined

export type ApiRequestInit = RequestInit & {
  skipCsrf?: boolean
}

function readCookie(name: string): string {
  try {
    const row = document.cookie
      .split('; ')
      .find((entry) => entry.startsWith(`${name}=`))
    return row ? decodeURIComponent(row.slice(name.length + 1)) : ''
  } catch {
    return ''
  }
}

function toMethod(init: RequestInit): string {
  return String(init.method || 'GET').toUpperCase()
}

function withCsrfHeader(headersInit: HeadersInitLike, method: string, skipCsrf: boolean): Headers {
  const headers = new Headers(headersInit)
  if (skipCsrf || SAFE_METHODS.has(method) || headers.has('X-CSRF-Token')) return headers
  const csrf = readCookie('csrf')
  if (csrf) headers.set('X-CSRF-Token', csrf)
  return headers
}

export async function apiFetch(url: string, init: ApiRequestInit = {}): Promise<Response> {
  const method = toMethod(init)
  const headers = withCsrfHeader(init.headers, method, !!init.skipCsrf)
  return fetch(url, {
    ...init,
    method,
    headers,
    credentials: init.credentials ?? 'include',
  })
}

export async function apiJson<T>(url: string, init: ApiRequestInit = {}): Promise<T> {
  const res = await apiFetch(url, init)
  if (!res.ok) {
    throw new Error(await readErrorMessage(res, `HTTP ${res.status}`))
  }
  return res.json() as Promise<T>
}
