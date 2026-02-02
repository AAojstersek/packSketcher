import { describe, expect, it } from 'vitest'
import { smallestFreeWorkspaceName } from '@/lib/workspaces/naming'

describe('smallestFreeWorkspaceName', () => {
  it('returns base name when free', () => {
    expect(smallestFreeWorkspaceName('Motorcycle', [])).toBe('Motorcycle')
  })

  it('finds smallest missing suffix', () => {
    const existing = ['Motorcycle', 'Motorcycle (2)', 'Motorcycle (4)']
    expect(smallestFreeWorkspaceName('Motorcycle', existing)).toBe('Motorcycle (3)')
  })

  it('is case-insensitive', () => {
    const existing = ['motorcycle', 'MoToRcYcLe (2)']
    expect(smallestFreeWorkspaceName('Motorcycle', existing)).toBe('Motorcycle (3)')
  })

  it('trims and clamps base name', () => {
    const base = '   My Workspace   '
    expect(smallestFreeWorkspaceName(base, ['My Workspace'])).toBe('My Workspace (2)')
  })

  it('handles long names when adding suffix', () => {
    const longBase = 'X'.repeat(60)
    const result = smallestFreeWorkspaceName(longBase, [longBase])
    expect(result.length).toBeLessThanOrEqual(60)
    expect(result.endsWith(' (2)')).toBe(true)
  })
})
