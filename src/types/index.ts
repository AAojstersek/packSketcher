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
  bag_id: string
  user_id: string
  name: string
  description: string | null
  weight: number | null
  created_at: string
  updated_at: string
  last_moved_at?: string | null
}

export interface Bag {
  id: string
  pack_id: string
  user_id: string
  x: number
  y: number
  width: number
  height: number
  created_at: string
  name: string
  color: string
  bag_weight_kg?: number
  bag_weight?: number | null
  locked: boolean
  updated_at: string
  z_index: number
}

export type ActivityEventType =
  | 'workspace_renamed'
  | 'workspace_deleted'
  | 'box_created'
  | 'box_deleted'
  | 'item_created'
  | 'item_deleted'
  | 'item_moved'

export interface Activity {
  id: string
  user_id: string
  event_type: ActivityEventType
  message: string
  created_at: string
}

export type SubscriptionStatus =
  | 'incomplete'
  | 'incomplete_expired'
  | 'trialing'
  | 'active'
  | 'past_due'
  | 'canceled'
  | 'unpaid'

export type AccessState =
  | 'no_access'
  | 'beta_access'
  | 'active_subscription'
  | 'past_due'
  | 'canceled'
