import { describe, expect, it } from 'vitest'
import {
  MAX_NAME_LENGTH,
  normalizeName,
  normalizeOptionalWeightKg,
  normalizeWeightKg,
  validateRequiredName,
  validateWeightKg,
} from '@/lib/validation'

describe('validation helpers', () => {
  describe('names', () => {
    it('trims and clamps to 60 chars', () => {
      const padded = '   My Box   '
      expect(normalizeName(padded)).toBe('My Box')

      const long = 'x'.repeat(MAX_NAME_LENGTH + 5)
      expect(normalizeName(long)).toHaveLength(MAX_NAME_LENGTH)
    })

    it('flags empty names', () => {
      const result = validateRequiredName('   ')
      expect(result.error).toBe('Name is required')
      expect(result.value).toBe('')
    })
  })

  describe('weights', () => {
    it('normalizes required weight with commas/dots and clamps', () => {
      expect(normalizeWeightKg('0,9')).toBeCloseTo(0.9)
      expect(normalizeWeightKg('')).toBe(0)
      expect(normalizeWeightKg(9500)).toBe(9000)
    })

    it('normalizes optional weight and preserves null when empty', () => {
      expect(normalizeOptionalWeightKg('')).toBeNull()
      expect(normalizeOptionalWeightKg('  ')).toBeNull()
      expect(normalizeOptionalWeightKg(undefined)).toBeNull()
      expect(normalizeOptionalWeightKg('1.5')).toBeCloseTo(1.5)
      expect(normalizeOptionalWeightKg(10000)).toBe(9000)
    })

    it('validates weight bounds', () => {
      expect(validateWeightKg(null)).toBeNull()
      expect(validateWeightKg(0)).toBeNull()
      expect(validateWeightKg(9000)).toBeNull()
      expect(validateWeightKg(-1)).toBe('Weight must be between 0 and 9000')
      expect(validateWeightKg(9001)).toBe('Weight must be between 0 and 9000')
    })
  })
})
