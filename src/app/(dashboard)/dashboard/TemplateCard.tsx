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
      <div className="relative h-48 bg-slate-100">
        <Image
          src={imageUrl}
          alt={name}
          fill
          className="object-cover"
        />
      </div>
      <div className="p-4">
        <h3 className="text-lg font-semibold text-slate-900 mb-2">
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
