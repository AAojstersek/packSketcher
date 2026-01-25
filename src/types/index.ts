export type BackgroundType = 'motorcycle' | 'bicycle' | 'backpack' | 'custom'

export interface Background {
  id: string
  user_id: string | null
  name: string
  type: BackgroundType
  image_url: string
  width: number
  height: number
  is_public: boolean
  created_at: string
}

export interface CreateBackgroundInput {
  name: string
  type: BackgroundType
  image_url: string
  width?: number | null
  height?: number | null
}
