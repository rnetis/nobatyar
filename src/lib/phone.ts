const FA = '۰۱۲۳۴۵۶۷۸۹'
const AR = '٠١٢٣٤٥٦٧٨٩'

/** Normalize Iranian mobiles: Persian/Arabic digits, +98 / 0098 / 98 prefixes → "09xxxxxxxxx". Returns null if invalid. */
export function normalizeMobile(input: unknown): string | null {
  if (typeof input !== 'string') return null
  let s = input
    .replace(/[۰-۹]/g, (d) => String(FA.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String(AR.indexOf(d)))
    .replace(/[\s\-()]/g, '')
  if (s.startsWith('+98')) s = '0' + s.slice(3)
  else if (s.startsWith('0098')) s = '0' + s.slice(4)
  else if (/^98\d{10}$/.test(s)) s = '0' + s.slice(2)
  else if (/^9\d{9}$/.test(s)) s = '0' + s
  return /^09\d{9}$/.test(s) ? s : null
}
