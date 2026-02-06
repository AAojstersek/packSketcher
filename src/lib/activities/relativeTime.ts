const SECOND = 1
const MINUTE = 60 * SECOND
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR
const WEEK = 7 * DAY
const MONTH = 30 * DAY
const YEAR = 365 * DAY

export function formatRelativeTime(input: string | Date, now: Date = new Date()): string {
  const date = input instanceof Date ? input : new Date(input)
  const diffSeconds = Math.floor((now.getTime() - date.getTime()) / 1000)

  if (!Number.isFinite(diffSeconds) || diffSeconds < MINUTE) {
    return 'just now'
  }

  if (diffSeconds < HOUR) {
    return `${Math.floor(diffSeconds / MINUTE)}m ago`
  }

  if (diffSeconds < DAY) {
    return `${Math.floor(diffSeconds / HOUR)}h ago`
  }

  if (diffSeconds < WEEK) {
    return `${Math.floor(diffSeconds / DAY)}d ago`
  }

  if (diffSeconds < MONTH) {
    return `${Math.floor(diffSeconds / WEEK)}w ago`
  }

  if (diffSeconds < YEAR) {
    return `${Math.floor(diffSeconds / MONTH)}mo ago`
  }

  return `${Math.floor(diffSeconds / YEAR)}y ago`
}
