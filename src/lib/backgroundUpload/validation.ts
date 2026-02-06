import { normalizeName } from '@/lib/validation'

export const ALLOWED_BACKGROUND_UPLOAD_MIME_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
] as const

export const MAX_BACKGROUND_UPLOAD_BYTES = 10 * 1024 * 1024

const MIME_EXTENSION_MAP: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
}

export interface BackgroundUploadValidationInput {
  name: string
  mimeType: string
  sizeBytes: number
  width: number
  height: number
}

export interface BackgroundUploadValidationResult {
  normalizedName: string
  error: string | null
}

export function isAllowedBackgroundUploadMimeType(mimeType: string): boolean {
  return ALLOWED_BACKGROUND_UPLOAD_MIME_TYPES.includes(
    mimeType as (typeof ALLOWED_BACKGROUND_UPLOAD_MIME_TYPES)[number]
  )
}

export function extensionForBackgroundUploadMimeType(mimeType: string): string | null {
  return MIME_EXTENSION_MAP[mimeType] ?? null
}

function isPositiveFiniteNumber(value: number): boolean {
  return Number.isFinite(value) && value > 0
}

export function validateBackgroundUploadInput(
  input: BackgroundUploadValidationInput
): BackgroundUploadValidationResult {
  const normalizedName = normalizeName(input.name ?? '')

  if (!normalizedName) {
    return { normalizedName: '', error: 'Workspace name is required.' }
  }

  if (!isAllowedBackgroundUploadMimeType(input.mimeType)) {
    return { normalizedName, error: 'Only PNG, JPEG, and WEBP images are supported.' }
  }

  if (!Number.isFinite(input.sizeBytes) || input.sizeBytes <= 0) {
    return { normalizedName, error: 'Please choose an image file.' }
  }

  if (input.sizeBytes > MAX_BACKGROUND_UPLOAD_BYTES) {
    return { normalizedName, error: 'Image must be 10MB or smaller.' }
  }

  if (!isPositiveFiniteNumber(input.width) || !isPositiveFiniteNumber(input.height)) {
    return { normalizedName, error: 'Could not read image dimensions.' }
  }

  return { normalizedName, error: null }
}
