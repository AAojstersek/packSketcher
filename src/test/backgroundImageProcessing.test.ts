import sharp from 'sharp'
import { describe, expect, it } from 'vitest'
import {
  CUSTOM_BACKGROUND_MAX_DIMENSION,
  processCustomBackgroundImage,
} from '@/lib/backgroundUpload/processImage'

describe('processCustomBackgroundImage', () => {
  it('resizes to max dimension and emits webp', async () => {
    const input = await sharp({
      create: {
        width: 3000,
        height: 1000,
        channels: 3,
        background: { r: 255, g: 20, b: 20 },
      },
    })
      .png()
      .toBuffer()
    const file = {
      arrayBuffer: async () => input.buffer.slice(input.byteOffset, input.byteOffset + input.byteLength),
    }

    const result = await processCustomBackgroundImage(file)

    expect(result.extension).toBe('webp')
    expect(result.mimeType).toBe('image/webp')
    expect(result.width).toBe(CUSTOM_BACKGROUND_MAX_DIMENSION)
    expect(result.height).toBeLessThanOrEqual(CUSTOM_BACKGROUND_MAX_DIMENSION)
  })

  it('applies grayscale conversion', async () => {
    const input = await sharp({
      create: {
        width: 10,
        height: 10,
        channels: 3,
        background: { r: 255, g: 0, b: 0 },
      },
    })
      .png()
      .toBuffer()
    const file = {
      arrayBuffer: async () => input.buffer.slice(input.byteOffset, input.byteOffset + input.byteLength),
    }

    const result = await processCustomBackgroundImage(file)
    const { data } = await sharp(result.buffer).raw().toBuffer({ resolveWithObject: true })

    expect(data.length).toBeGreaterThan(2)
    expect(data[0]).toBe(data[1])
    expect(data[1]).toBe(data[2])
  })

  it('throws for invalid image bytes', async () => {
    const invalid = {
      arrayBuffer: async () => new Uint8Array([1, 2, 3, 4]).buffer,
    }

    await expect(processCustomBackgroundImage(invalid)).rejects.toThrow()
  })
})
