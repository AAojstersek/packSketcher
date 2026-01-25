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

export interface Pack {
  id: string
  background_id: string
  user_id: string
  name: string
  created_at: string
  updated_at: string
}

export interface Item {
  id: string
  pack_id: string
  user_id: string
  x: number
  y: number
  width: number
  height: number
  created_at: string
}
