import {
  extensionForBackgroundUploadMimeType,
  isAllowedBackgroundUploadMimeType,
  MAX_BACKGROUND_UPLOAD_BYTES,
  validateBackgroundUploadInput,
} from '@/lib/backgroundUpload/validation'
import { describe, expect, it } from 'vitest'

describe('background upload validation', () => {
  it('accepts valid metadata and normalizes name', () => {
    const result = validateBackgroundUploadInput({
      name: '  Garage layout  ',
      mimeType: 'image/png',
      sizeBytes: 1024,
      width: 1920,
      height: 1080,
    })

    expect(result).toEqual({
      normalizedName: 'Garage layout',
      error: null,
    })
  })

  it('accepts uploads when dimensions are omitted', () => {
    const result = validateBackgroundUploadInput({
      name: '  Garage layout  ',
      mimeType: 'image/png',
      sizeBytes: 1024,
    })

    expect(result).toEqual({
      normalizedName: 'Garage layout',
      error: null,
    })
  })

  it('rejects unsupported mime types', () => {
    const result = validateBackgroundUploadInput({
      name: 'Workspace',
      mimeType: 'image/gif',
      sizeBytes: 1024,
      width: 1000,
      height: 600,
    })

    expect(result.error).toBe('Only PNG, JPEG, and WEBP images are supported.')
  })

  it('rejects files larger than 10MB', () => {
    const result = validateBackgroundUploadInput({
      name: 'Workspace',
      mimeType: 'image/jpeg',
      sizeBytes: MAX_BACKGROUND_UPLOAD_BYTES + 1,
      width: 1000,
      height: 600,
    })

    expect(result.error).toBe('Image must be 10MB or smaller.')
  })

  it('rejects invalid dimensions', () => {
    const result = validateBackgroundUploadInput({
      name: 'Workspace',
      mimeType: 'image/webp',
      sizeBytes: 2048,
      width: 0,
      height: 600,
    })

    expect(result.error).toBe('Could not read image dimensions.')
  })
})

describe('background upload mime helpers', () => {
  it('knows allowed mime types', () => {
    expect(isAllowedBackgroundUploadMimeType('image/png')).toBe(true)
    expect(isAllowedBackgroundUploadMimeType('image/jpeg')).toBe(true)
    expect(isAllowedBackgroundUploadMimeType('image/webp')).toBe(true)
    expect(isAllowedBackgroundUploadMimeType('image/gif')).toBe(false)
  })

  it('maps mime type to storage extension', () => {
    expect(extensionForBackgroundUploadMimeType('image/png')).toBe('png')
    expect(extensionForBackgroundUploadMimeType('image/jpeg')).toBe('jpg')
    expect(extensionForBackgroundUploadMimeType('image/webp')).toBe('webp')
    expect(extensionForBackgroundUploadMimeType('image/gif')).toBeNull()
  })
})
