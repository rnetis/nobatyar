/**
 * All date logic (slots, queue day keys, "today") uses server-local time.
 * Pin the process to Tehran time so results don't depend on the host's TZ.
 * (Iran abolished DST in 2022, so this is a fixed +03:30 offset.)
 */
export function register() {
  if (!process.env.TZ) process.env.TZ = 'Asia/Tehran'
}
