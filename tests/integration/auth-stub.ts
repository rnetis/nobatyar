// Test stub: replaces next/headers cookie session with a controllable global.
type S = { userId: string; name: string; role: string; tenantId: string }
export const setSession = (s: S | null) => { (globalThis as any).__session = s }
const get = () => (globalThis as any).__session ?? null
export async function requireBusinessSession() { return get() }
export async function requireManagerSession() {
  const s = get(); return s && ['TENANT_OWNER', 'TENANT_ADMIN', 'MANAGER'].includes(s.role) ? s : null
}
export async function requireAdminSession() { return null }
export async function requireSuperAdminSession() { return null }
export function createSocketToken() { return 't' }
