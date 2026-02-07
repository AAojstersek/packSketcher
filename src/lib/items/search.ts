export interface ItemsSearchParams {
  term: string
  shouldQuery: boolean
}

export interface ItemsSearchResult {
  itemName: string
  workspaceName: string
  boxName: string
  backgroundId: string
  bagId: string
}

type MaybeArray<T> = T | T[] | null | undefined

interface RawBackground {
  id?: string
  name?: string
}

interface RawPack {
  background_id?: string
  backgrounds?: MaybeArray<RawBackground>
}

interface RawBag {
  id?: string
  name?: string
  pack_id?: string
  packs?: MaybeArray<RawPack>
}

export interface RawItemsSearchRow {
  name?: string
  description?: string | null
  last_moved_at?: string | null
  bag_id?: string
  bags?: MaybeArray<RawBag>
}

function pickOne<T>(value: MaybeArray<T>): T | null {
  if (Array.isArray(value)) {
    return value[0] ?? null
  }
  return value ?? null
}

/**
 * Validate and normalize the search term.
 * Returns the normalized term and whether a DB query should run.
 */
export function parseItemsSearchQuery(raw: string | null): ItemsSearchParams {
  const term = (raw ?? '').trim()
  if (term.length < 3) {
    return { term, shouldQuery: false }
  }
  return { term, shouldQuery: true }
}

/**
 * Convert PostgREST nested rows into the lean shape the UI needs.
 * Drops rows that are missing any required contextual fields.
 */
export function shapeItemsSearchResults(rows: RawItemsSearchRow[]): ItemsSearchResult[] {
  return rows
    .map((row) => {
      const bag = pickOne(row.bags)
      const pack = pickOne(bag?.packs)
      const backgroundId = pack?.background_id
      const background = pickOne(pack?.backgrounds)
      const workspaceName = background?.name

      if (!row.name || !bag?.id || !bag.name || !backgroundId || !workspaceName) {
        return null
      }

      return {
        itemName: row.name,
        workspaceName,
        boxName: bag.name,
        backgroundId,
        bagId: bag.id,
      }
    })
    .filter((result): result is ItemsSearchResult => Boolean(result))
}
