import { TemplateCard } from './TemplateCard'
import type { BackgroundType } from '@/types'

interface Template {
  name: string
  type: BackgroundType
  imageUrl: string
}

interface TemplateGridProps {
  templates: Template[]
}

export function TemplateGrid({ templates }: TemplateGridProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      {templates.map((template) => (
        <TemplateCard
          key={template.type}
          name={template.name}
          type={template.type}
          imageUrl={template.imageUrl}
        />
      ))}
    </div>
  )
}
