import { TemplateCard } from '@/app/(dashboard)/dashboard/TemplateCard'
import { render, screen } from '@testing-library/react'
import type { ImgHTMLAttributes } from 'react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('next/image', () => ({
  __esModule: true,
  default: (props: ImgHTMLAttributes<HTMLImageElement> & { fill?: boolean }) => {
    const { fill, ...imageProps } = props
    void fill
    // eslint-disable-next-line jsx-a11y/alt-text, @next/next/no-img-element
    return <img {...imageProps} />
  },
}))

vi.mock('@/app/(dashboard)/dashboard/CreateFromTemplateButton', () => ({
  CreateFromTemplateButton: () => <button type="button">Create</button>,
}))

describe('TemplateCard', () => {
  it('sets responsive sizes hint for template image', () => {
    render(
      <TemplateCard
        name="Motorcycle"
        type="motorcycle"
        imageUrl="/ozadja/motoOzadje.webp"
      />
    )

    expect(screen.getByRole('img', { name: 'Motorcycle' })).toHaveAttribute(
      'sizes',
      '(max-width: 768px) 100vw, (max-width: 1280px) 50vw, 33vw'
    )
  })
})
