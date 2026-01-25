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
    <div className="bg-white rounded-lg shadow-md overflow-hidden hover:shadow-lg transition-shadow">
      <div className="relative h-48 bg-gray-100">
        <Image
          src={imageUrl}
          alt={name}
          fill
          className="object-cover"
        />
      </div>
      <div className="p-4">
        <h3 className="text-lg font-semibold text-gray-900 mb-2">
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
