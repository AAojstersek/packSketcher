interface ParseStoragePathOptions {
  supabaseUrl?: string
}

const PUBLIC_PATH_PREFIX = '/storage/v1/object/public/'

export function parseStorageObjectPathFromPublicUrl(
  imageUrl: string,
  bucket: string,
  options: ParseStoragePathOptions = {}
): string | null {
  const normalizedBucket = (bucket ?? '').trim()
  if (!normalizedBucket) return null

  try {
    const parsed = new URL(imageUrl)
    if (options.supabaseUrl) {
      const expected = new URL(options.supabaseUrl)
      if (parsed.host !== expected.host) return null
    }

    if (!parsed.pathname.startsWith(PUBLIC_PATH_PREFIX)) return null
    const suffix = decodeURIComponent(parsed.pathname.slice(PUBLIC_PATH_PREFIX.length))
    if (!suffix.startsWith(`${normalizedBucket}/`)) return null
    const objectPath = suffix.slice(normalizedBucket.length + 1)
    if (!objectPath || objectPath.startsWith('/') || objectPath.endsWith('/')) return null
    return objectPath
  } catch {
    return null
  }
}
