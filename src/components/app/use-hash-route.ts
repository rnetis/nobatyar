'use client'

import { useEffect, useState, useCallback } from 'react'

export type AppRoute =
  | { view: 'home' }
  | { view: 'book'; slug?: string }
  | { view: 'queue'; token: string }
  | { view: 'panel'; section?: string }
  | { view: 'admin'; section?: string }
  | { view: 'login'; scope: 'business' | 'admin' }

export function parseHash(hash: string): AppRoute {
  const clean = hash.replace(/^#\/?/, '')
  const parts = clean.split('/').filter(Boolean)
  if (parts.length === 0) return { view: 'home' }
  switch (parts[0]) {
    case 'book':
      return { view: 'book', slug: parts[1] }
    case 'q':
      return parts[1] ? { view: 'queue', token: parts[1] } : { view: 'home' }
    case 'panel':
      return { view: 'panel', section: parts[1] }
    case 'admin':
      return { view: 'admin', section: parts[1] }
    case 'login':
      return { view: 'login', scope: parts[1] === 'admin' ? 'admin' : 'business' }
    default:
      return { view: 'home' }
  }
}

export function useHashRoute(): [AppRoute, (to: string) => void] {
  const [route, setRoute] = useState<AppRoute>(() =>
    typeof window === 'undefined' ? { view: 'home' } : parseHash(window.location.hash),
  )

  useEffect(() => {
    const onHash = () => {
      setRoute(parseHash(window.location.hash))
      window.scrollTo({ top: 0 })
    }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  const navigate = useCallback((to: string) => {
    window.location.hash = to.startsWith('#') ? to : `#${to}`
  }, [])

  return [route, navigate]
}
