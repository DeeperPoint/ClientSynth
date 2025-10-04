// Lightweight client for calling the FastAPI backend from the v0 frontend

const BACKEND_URL = (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_BACKEND_URL) || 'http://localhost:8000'

const TOKEN_KEY = 'backend_access_token'

export function getBackendUrl(): string {
  return BACKEND_URL
}

export function getToken(): string | null {
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

export function setToken(token: string | null) {
  if (typeof window === 'undefined') return
  try {
    if (token) {
      window.localStorage.setItem(TOKEN_KEY, token)
    } else {
      window.localStorage.removeItem(TOKEN_KEY)
    }
  } catch {
    // noop
  }
}

export function authHeaders(extra?: HeadersInit): HeadersInit {
  const token = getToken()
  const headers: Record<string, string> = {
    ...(extra as Record<string, string> | undefined),
  }
  if (token) headers['Authorization'] = `Bearer ${token}`
  return headers
}

export async function apiFetch(input: string, init?: RequestInit) {
  const url = input.startsWith('http') ? input : `${getBackendUrl()}${input}`
  const headers = authHeaders(init?.headers)
  const res = await fetch(url, { ...init, headers })
  return res
}
