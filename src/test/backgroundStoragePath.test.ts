import { describe, expect, it } from 'vitest'
import { parseStorageObjectPathFromPublicUrl } from '@/lib/backgroundUpload/storagePath'

describe('parseStorageObjectPathFromPublicUrl', () => {
  it('returns object path for matching bucket and host', () => {
    const path = parseStorageObjectPathFromPublicUrl(
      'https://abc.supabase.co/storage/v1/object/public/backgrounds/user-1/custom/a.webp',
      'backgrounds',
      { supabaseUrl: 'https://abc.supabase.co' }
    )
    expect(path).toBe('user-1/custom/a.webp')
  })

  it('returns null for different host', () => {
    const path = parseStorageObjectPathFromPublicUrl(
      'https://other.supabase.co/storage/v1/object/public/backgrounds/user-1/a.webp',
      'backgrounds',
      { supabaseUrl: 'https://abc.supabase.co' }
    )
    expect(path).toBeNull()
  })

  it('returns null for different bucket', () => {
    const path = parseStorageObjectPathFromPublicUrl(
      'https://abc.supabase.co/storage/v1/object/public/assets/user-1/a.webp',
      'backgrounds'
    )
    expect(path).toBeNull()
  })

  it('returns null for malformed urls', () => {
    expect(parseStorageObjectPathFromPublicUrl('not-a-url', 'backgrounds')).toBeNull()
  })
})
