const format = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })

export function ago(at: number, now = Date.now()): string {
  const minutes = Math.round((at - now) / 60_000)
  if (Math.abs(minutes) < 60) return format.format(minutes, 'minute')
  const hours = Math.round(minutes / 60)
  if (Math.abs(hours) < 24) return format.format(hours, 'hour')
  return format.format(Math.round(hours / 24), 'day')
}
