import Image from 'next/image'
import { CreateFromTemplateButton } from './CreateFromTemplateButton'
import type { BackgroundType } from '@/types'

interface TemplateCardProps {
  name: string
  type: BackgroundType
  imageUrl: string
}

export function TemplateCard({ name, type, imageUrl }: TemplateCardProps) {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition-shadow hover:shadow-md">
      <div className="relative h-40 bg-slate-100 sm:h-48">
        <Image
          src={imageUrl}
          alt={name}
          fill
          sizes="(max-width: 768px) 100vw, (max-width: 1280px) 50vw, 33vw"
          className="object-cover"
        />
      </div>
      <div className="p-3 sm:p-4">
        <h3 className="mb-2 text-base font-semibold text-slate-900 sm:text-lg">
          {name}
        </h3>
        <CreateFromTemplateButton
          name={name}
          type={type}
          imageUrl={imageUrl}
        />
      </div>
    </div>
  )
}
