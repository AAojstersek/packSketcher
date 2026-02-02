type KnownCode =
  | 'unique_workspace_name'
  | 'unique_box_name'
  | 'unique_item_name'
  | 'name_trim'
  | 'name_empty'
  | 'name_max_length'
  | 'weight_range'
  | 'unknown'

export interface MappedError {
  code: KnownCode
  message: string
}

/**
 * Map Supabase/Postgres errors into stable, user-friendly codes + messages.
 * We rely on Postgres error `code` and `constraint` hints to keep client logic consistent.
 */
export function mapSupabaseError(err: unknown): MappedError {
  const fallback: MappedError = { code: 'unknown', message: 'Something went wrong' }
  const error = err as { code?: string; message?: string; hint?: string; details?: string }

  const constraint =
    (error as any)?.constraint ||
    extractConstraintFromDetails(error.details) ||
    extractConstraintFromMessage(error.message)

  // Unique name conflicts
  if (error.code === '23505') {
    if (constraint?.includes('backgrounds')) {
      return { code: 'unique_workspace_name', message: 'Workspace name is already in use' }
    }
    if (constraint?.includes('bags')) {
      return { code: 'unique_box_name', message: 'Box name is already in use' }
    }
    if (constraint?.includes('items')) {
      return { code: 'unique_item_name', message: 'Item name is already in use' }
    }
  }

  // Check constraint violations (trim/empty/length/weight)
  if (error.code === '23514') {
    if (constraint?.includes('trim')) {
      return { code: 'name_trim', message: 'Names cannot start or end with spaces' }
    }
    if (constraint?.includes('not_empty')) {
      return { code: 'name_empty', message: 'Name is required' }
    }
    if (constraint?.includes('max_length')) {
      return { code: 'name_max_length', message: 'Name must be 60 characters or fewer' }
    }
    if (constraint?.includes('weight')) {
      return {
        code: 'weight_range',
        message: 'Weight must be between 0 and 9000',
      }
    }
  }

  return fallback
}

function extractConstraintFromDetails(details?: string): string | undefined {
  if (!details) return undefined
  const match = /constraint "([^"]+)"/i.exec(details)
  return match?.[1]
}

function extractConstraintFromMessage(message?: string): string | undefined {
  if (!message) return undefined
  const match = /constraint "([^"]+)"/i.exec(message)
  return match?.[1]
}
