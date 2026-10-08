import { toJalaali, toGregorian } from 'jalaali-js'

// ───────────────────────── Persian digit & formatting helpers ─────────────────────────

const FA_DIGITS = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹']

export function faDigits(input: string | number): string {
  return String(input).replace(/\d/g, (d) => FA_DIGITS[Number(d)])
}

export function faNumber(n: number): string {
  return faDigits(n.toLocaleString('en-US'))
}

export const JALALI_MONTHS = [
  'فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور',
  'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند',
]

export const WEEKDAYS_FA = ['یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه', 'شنبه']
// JS getDay(): 0=Sun … 6=Sat. Persian week starts Saturday.
export const WEEKDAYS_FA_SHORT = ['ی', 'د', 'س', 'چ', 'پ', 'ج', 'ش']
export function weekdayShortFa(getDay: number): string {
  // map JS day to Persian short letter
  return WEEKDAYS_FA_SHORT[getDay]
}

// ───────────────────────── Core conversions ─────────────────────────

/** "2026-10-08" style local date key for a Date (in Tehran terms we treat server local). */
export function dateKey(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function parseDateKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, m - 1, d, 12, 0, 0)
}

export function toJalali(d: Date): { jy: number; jm: number; jd: number } {
  const y = d.getFullYear()
  if (!Number.isFinite(y)) return toJalaali(new Date().getFullYear(), new Date().getMonth() + 1, new Date().getDate())
  return toJalaali(y, d.getMonth() + 1, d.getDate())
}

export function fromJalali(jy: number, jm: number, jd: number): Date {
  const g = toGregorian(jy, jm, jd)
  return new Date(g.gy, g.gm - 1, g.gd, 12, 0, 0)
}

/** Parse any date input: Date, ISO string, or "YYYY-MM-DD" key */
export function toDate(d: Date | string): Date {
  if (d instanceof Date) return d
  if (d.includes('T')) return new Date(d) // full ISO timestamp
  return parseDateKey(d) // date-only key
}

// ───────────────────────── Formatters ─────────────────────────

/** "چهارشنبه ۱۶ مهر ۱۴۰۵" */
export function formatJalaliFull(d: Date | string): string {
  const date = toDate(d)
  const { jy, jm, jd } = toJalali(date)
  const weekday = WEEKDAYS_FA[date.getDay()]
  return `${weekday} ${faDigits(jd)} ${JALALI_MONTHS[jm - 1]} ${faDigits(jy)}`
}

/** "۱۶ مهر ۱۴۰۵" */
export function formatJalaliMedium(d: Date | string): string {
  const date = toDate(d)
  const { jy, jm, jd } = toJalali(date)
  return `${faDigits(jd)} ${JALALI_MONTHS[jm - 1]} ${faDigits(jy)}`
}

/** "16 مهر" */
export function formatJalaliShort(d: Date | string): string {
  const date = toDate(d)
  const { jm, jd } = toJalali(date)
  return `${faDigits(jd)} ${JALALI_MONTHS[jm - 1]}`
}

/** "۱۰:۴۲" */
export function formatTime(d: Date | string): string {
  const date = typeof d === 'string' ? new Date(d) : d
  const hh = String(date.getHours()).padStart(2, '0')
  const mm = String(date.getMinutes()).padStart(2, '0')
  return faDigits(`${hh}:${mm}`)
}

/** "۱۰:۴۲" from "10:42" */
export function timeFa(t: string): string {
  return faDigits(t)
}

/** "۲۵ دقیقه" / "۱ ساعت و ۵ دقیقه" */
export function minutesFa(min: number): string {
  if (min <= 0) return 'چند لحظه'
  if (min < 60) return `${faDigits(min)} دقیقه`
  const h = Math.floor(min / 60)
  const m = min % 60
  if (m === 0) return `${faDigits(h)} ساعت`
  return `${faDigits(h)} ساعت و ${faDigits(m)} دقیقه`
}

export function tomanFa(n: number): string {
  return `${faNumber(n)} تومان`
}

// ───────────────────────── Booking day list ─────────────────────────

export interface DayOption {
  key: string        // "2026-10-08"
  jd: number         // jalali day number
  jm: number
  jy: number
  weekday: string    // چهارشنبه
  weekdayShort: string // چ
  isFriday: boolean
  label: string      // ۱۶ مهر
  full: string       // چهارشنبه ۱۶ مهر ۱۴۰۵
}

export function upcomingDays(days = 14, from = new Date()): DayOption[] {
  const out: DayOption[] = []
  for (let i = 0; i < days; i++) {
    const d = new Date(from.getFullYear(), from.getMonth(), from.getDate() + i, 12)
    const { jy, jm, jd } = toJalali(d)
    out.push({
      key: dateKey(d),
      jd,
      jm,
      jy,
      weekday: WEEKDAYS_FA[d.getDay()],
      weekdayShort: WEEKDAYS_FA_SHORT[d.getDay()],
      isFriday: d.getDay() === 5,
      label: formatJalaliShort(d),
      full: formatJalaliFull(d),
    })
  }
  return out
}

// ───────────────────────── Time helpers ─────────────────────────

export function timeToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + (m || 0)
}

export function minutesToTime(min: number): string {
  const h = Math.floor(min / 60)
  const m = min % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

export { toJalaali, toGregorian }
