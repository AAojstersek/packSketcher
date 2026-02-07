'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  validateBackgroundUploadInput,
  isAllowedBackgroundUploadMimeType,
  MAX_BACKGROUND_UPLOAD_BYTES,
} from '@/lib/backgroundUpload/validation'
import { readImageDimensions, type ImageDimensions } from '@/lib/backgroundUpload/imageDimensions'

function notifyActivitiesRefresh() {
  window.dispatchEvent(new Event('packsketcher:activities-refresh'))
}

function formatFileSize(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

interface UploadCustomBackgroundButtonProps {
  className?: string
}

export function UploadCustomBackgroundButton({ className }: UploadCustomBackgroundButtonProps) {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [dimensions, setDimensions] = useState<ImageDimensions | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const resetForm = () => {
    setName('')
    setSelectedFile(null)
    setDimensions(null)
    setError(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const handleOpen = () => {
    resetForm()
    setOpen(true)
  }

  const handleClose = () => {
    if (submitting) return
    resetForm()
    setOpen(false)
  }

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    setError(null)
    const file = event.target.files?.[0] ?? null
    setSelectedFile(null)
    setDimensions(null)

    if (!file) {
      return
    }

    if (!isAllowedBackgroundUploadMimeType(file.type)) {
      setError('Only PNG, JPEG, and WEBP images are supported.')
      return
    }

    if (file.size > MAX_BACKGROUND_UPLOAD_BYTES) {
      setError('Image must be 10MB or smaller.')
      return
    }

    try {
      const nextDimensions = await readImageDimensions(file)
      setSelectedFile(file)
      setDimensions(nextDimensions)
    } catch {
      setError('Could not read image dimensions.')
    }
  }

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)

    if (!selectedFile || !dimensions) {
      setError('Please choose an image file.')
      return
    }

    const validation = validateBackgroundUploadInput({
      name,
      mimeType: selectedFile.type,
      sizeBytes: selectedFile.size,
      width: dimensions.width,
      height: dimensions.height,
    })

    if (validation.error) {
      setError(validation.error)
      return
    }

    const formData = new FormData()
    formData.append('name', validation.normalizedName)
    formData.append('width', String(dimensions.width))
    formData.append('height', String(dimensions.height))
    formData.append('file', selectedFile)

    setSubmitting(true)
    try {
      const response = await fetch('/api/backgrounds', {
        method: 'POST',
        body: formData,
      })
      const data = await response.json().catch(() => null)

      if (!response.ok) {
        const errorFromPayload =
          data && typeof data === 'object' && 'error' in data
            ? (data as { error?: unknown }).error
            : null
        setError(
          typeof errorFromPayload === 'string'
            ? errorFromPayload
            : 'Failed to upload custom background. Please try again.'
        )
        return
      }

      notifyActivitiesRefresh()
      handleClose()
      router.refresh()
    } catch {
      setError('Failed to upload custom background. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <button
        type="button"
        className={`inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-900 transition-colors hover:bg-slate-50 ${className ?? ''}`}
        onClick={handleOpen}
      >
        Upload Custom Background
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="upload-custom-background-title"
            className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-xl"
          >
            <h3 id="upload-custom-background-title" className="text-lg font-semibold text-slate-900">
              Upload Custom Background
            </h3>
            <p className="mt-1 text-sm text-slate-600">
              PNG, JPEG, or WEBP up to {formatFileSize(MAX_BACKGROUND_UPLOAD_BYTES)}.
            </p>

            <form className="mt-4 space-y-4" onSubmit={handleSubmit}>
              <div>
                <label htmlFor="custom-background-name" className="mb-1 block text-sm font-medium text-slate-700">
                  Workspace name
                </label>
                <input
                  id="custom-background-name"
                  type="text"
                  maxLength={60}
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-slate-300 focus:ring-2 focus:ring-slate-200"
                  placeholder="My custom workspace"
                  disabled={submitting}
                />
              </div>

              <div>
                <label htmlFor="custom-background-file" className="mb-1 block text-sm font-medium text-slate-700">
                  Image file
                </label>
                <input
                  id="custom-background-file"
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={handleFileChange}
                  disabled={submitting}
                  className="block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-slate-700 hover:file:bg-slate-200"
                />
                {selectedFile && dimensions && (
                  <p className="mt-1 text-xs text-slate-500">
                    {selectedFile.name} ({dimensions.width}×{dimensions.height})
                  </p>
                )}
              </div>

              {error && (
                <p role="alert" className="text-sm text-red-600">
                  {error}
                </p>
              )}

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={handleClose}
                  disabled={submitting}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:pointer-events-none disabled:opacity-60"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="rounded-lg border border-slate-900 bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:pointer-events-none disabled:opacity-60"
                >
                  {submitting ? 'Uploading…' : 'Save'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
