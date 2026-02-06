export interface ImageDimensions {
  width: number
  height: number
}

export function readImageDimensions(file: File): Promise<ImageDimensions> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file)
    const image = new Image()

    image.onload = () => {
      URL.revokeObjectURL(objectUrl)
      if (!Number.isFinite(image.width) || !Number.isFinite(image.height)) {
        reject(new Error('Invalid image dimensions'))
        return
      }
      resolve({ width: image.width, height: image.height })
    }

    image.onerror = () => {
      URL.revokeObjectURL(objectUrl)
      reject(new Error('Failed to load image'))
    }

    image.src = objectUrl
  })
}
