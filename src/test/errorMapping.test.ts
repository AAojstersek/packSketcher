import { describe, expect, it } from 'vitest'
import { mapSupabaseError } from '@/lib/supabase/errorMapping'

function supabaseError(
  code: string,
  constraint?: string,
  details?: string,
  message?: string
) {
  return { code, constraint, details, message }
}

describe('mapSupabaseError', () => {
  it('maps unique workspace name', () => {
    const err = supabaseError('23505', 'backgrounds_user_id_name_key')
    expect(mapSupabaseError(err)).toEqual({
      code: 'unique_workspace_name',
      message: 'Workspace name is already in use',
    })
  })

  it('maps unique box name', () => {
    const err = supabaseError('23505', 'bags_pack_id_name_key')
    expect(mapSupabaseError(err).code).toBe('unique_box_name')
  })

  it('maps unique item name', () => {
    const err = supabaseError('23505', 'items_bag_id_name_key')
    expect(mapSupabaseError(err).code).toBe('unique_item_name')
  })

  it('maps trim/empty/max length name checks', () => {
    expect(mapSupabaseError(supabaseError('23514', 'name_trim_check')).code).toBe('name_trim')
    expect(mapSupabaseError(supabaseError('23514', 'name_not_empty_check')).code).toBe('name_empty')
    expect(mapSupabaseError(supabaseError('23514', 'name_max_length_check')).code).toBe(
      'name_max_length'
    )
  })

  it('maps weight range check', () => {
    expect(mapSupabaseError(supabaseError('23514', 'weight_range_check')).code).toBe('weight_range')
  })

  it('falls back to unknown', () => {
    expect(mapSupabaseError(supabaseError('99999'))).toEqual({
      code: 'unknown',
      message: 'Something went wrong',
    })
  })

  it('extracts constraint from message/details when not provided explicitly', () => {
    const withMessage = { code: '23505', message: 'duplicate key violates constraint "items_bag_id_name_key"' }
    expect(mapSupabaseError(withMessage).code).toBe('unique_item_name')

    const withDetails = { code: '23514', details: 'violates check constraint "name_not_empty_check"' }
    expect(mapSupabaseError(withDetails).code).toBe('name_empty')
  })
})
