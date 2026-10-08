'use client'

export class ApiError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

async function handle<T>(res: Response): Promise<T> {
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new ApiError((data as { error?: string }).error || 'خطای غیرمنتظره رخ داد', res.status)
  }
  return data as T
}

export function apiGet<T>(url: string): Promise<T> {
  return fetch(url, { cache: 'no-store' }).then((r) => handle<T>(r))
}

export function apiPost<T>(url: string, body: unknown): Promise<T> {
  return fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).then((r) => handle<T>(r))
}

export function apiPatch<T>(url: string, body: unknown): Promise<T> {
  return fetch(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).then((r) => handle<T>(r))
}

export function apiDelete<T>(url: string): Promise<T> {
  return fetch(url, { method: 'DELETE' }).then((r) => handle<T>(r))
}
