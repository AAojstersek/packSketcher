export const TEMPLATE_CREATED_EVENT = 'packsketcher:template-created'

export interface TemplateCreatedEventDetail {
  workspaceName: string
}

export function dispatchTemplateCreatedEvent(detail: TemplateCreatedEventDetail): void {
  window.dispatchEvent(new CustomEvent<TemplateCreatedEventDetail>(TEMPLATE_CREATED_EVENT, { detail }))
}
