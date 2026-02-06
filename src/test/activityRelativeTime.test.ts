import { describe, expect, it } from 'vitest'
import { formatRelativeTime } from '@/lib/activities/relativeTime'

describe('formatRelativeTime', () => {
  const now = new Date('2026-02-06T12:00:00Z')

  it('formats minute and hour differences', () => {
    expect(formatRelativeTime('2026-02-06T11:58:00Z', now)).toBe('2m ago')
    expect(formatRelativeTime('2026-02-06T10:00:00Z', now)).toBe('2h ago')
  })

  it('formats day and larger differences', () => {
    expect(formatRelativeTime('2026-02-03T12:00:00Z', now)).toBe('3d ago')
    expect(formatRelativeTime('2026-01-16T12:00:00Z', now)).toBe('3w ago')
    expect(formatRelativeTime('2025-12-06T12:00:00Z', now)).toBe('2mo ago')
    expect(formatRelativeTime('2024-02-06T12:00:00Z', now)).toBe('2y ago')
  })

  it('returns just now for very recent or invalid inputs', () => {
    expect(formatRelativeTime('2026-02-06T11:59:30Z', now)).toBe('just now')
    expect(formatRelativeTime('invalid-date', now)).toBe('just now')
  })
})
