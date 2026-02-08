import sharp from 'sharp'

export const CUSTOM_BACKGROUND_OUTPUT_FORMAT = 'webp'
export const CUSTOM_BACKGROUND_OUTPUT_MIME_TYPE = 'image/webp'
export const CUSTOM_BACKGROUND_MAX_DIMENSION = 2048
export const CUSTOM_BACKGROUND_WEBP_QUALITY = 70
export const CUSTOM_BACKGROUND_MAX_INPUT_PIXELS = 64_000_000

export interface ProcessCustomBackgroundOptions {
  maxDimension?: number
  quality?: number
}

export interface ProcessedCustomBackgroundImage {
  buffer: Buffer
  width: number
  height: number
  mimeType: string
  extension: string
}

interface FileLike {
  arrayBuffer?: () => Promise<ArrayBufferLike>
}

function normalizePositiveInt(value: number | undefined, fallback: number): number {
  if (!Number.isFinite(value) || value == null) return fallback
  const rounded = Math.round(value)
  return rounded > 0 ? rounded : fallback
}

export async function processCustomBackgroundImage(
  file: FileLike,
  options: ProcessCustomBackgroundOptions = {}
): Promise<ProcessedCustomBackgroundImage> {
  const maxDimension = normalizePositiveInt(options.maxDimension, CUSTOM_BACKGROUND_MAX_DIMENSION)
  const quality = normalizePositiveInt(options.quality, CUSTOM_BACKGROUND_WEBP_QUALITY)
  const inputArrayBuffer =
    typeof file.arrayBuffer === 'function'
      ? await file.arrayBuffer()
      : await new Response(file as Blob).arrayBuffer()
  const inputBuffer = Buffer.from(inputArrayBuffer)

  const pipeline = sharp(inputBuffer, { limitInputPixels: CUSTOM_BACKGROUND_MAX_INPUT_PIXELS })
    .rotate()
    .resize({
      width: maxDimension,
      height: maxDimension,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .grayscale()
    .webp({ quality })

  const { data, info } = await pipeline.toBuffer({ resolveWithObject: true })
  if (!info.width || !info.height) {
    throw new Error('Invalid processed image dimensions')
  }

  return {
    buffer: data,
    width: info.width,
    height: info.height,
    mimeType: CUSTOM_BACKGROUND_OUTPUT_MIME_TYPE,
    extension: CUSTOM_BACKGROUND_OUTPUT_FORMAT,
  }
}
