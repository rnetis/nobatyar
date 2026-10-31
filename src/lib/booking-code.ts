import { randomInt } from 'node:crypto'
import type { Prisma } from '@prisma/client'

// No 0/O/1/I/L — codes are read aloud and typed from SMS.
const ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ'

export function sanitizePrefix(prefix: string | null | undefined, fallback = 'A'): string {
  const p = (prefix || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 3)
  return p || fallback
}

/**
 * Globally unique, non-guessable booking code, e.g. "A-7K3QX".
 * Replaces the old `count+1` scheme, which collided across tenants sharing a prefix
 * (→ 500 on the unique index), leaked booking volume, and was guessable.
 * Must run inside the same transaction that creates the appointment.
 */
export async function generateUniqueCode(client: Prisma.TransactionClient, prefix: string): Promise<string> {
  const p = sanitizePrefix(prefix)
  for (let attempt = 0; attempt < 10; attempt++) {
    let s = ''
    for (let i = 0; i < 5; i++) s += ALPHABET[randomInt(ALPHABET.length)]
    const code = `${p}-${s}`
    const clash = await client.appointment.findUnique({ where: { code }, select: { id: true } })
    if (!clash) return code
  }
  throw new Error('could not allocate a unique booking code')
}
