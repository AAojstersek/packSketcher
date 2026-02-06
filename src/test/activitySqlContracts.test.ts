import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

function readDoc(relativePath: string): string {
  const fullPath = path.resolve(process.cwd(), relativePath)
  return fs.readFileSync(fullPath, 'utf8')
}

describe('activity SQL contracts', () => {
  it('defines trigger events for workspace/box/item create-delete-rename', () => {
    const sql = readDoc('docs/07_triggers_activities.sql')

    expect(sql).toContain("'workspace_renamed'")
    expect(sql).toContain("'workspace_deleted'")
    expect(sql).toContain("'box_created'")
    expect(sql).toContain("'box_deleted'")
    expect(sql).toContain("'item_created'")
    expect(sql).toContain("'item_deleted'")
  })

  it('logs item_moved from move_items_bulk RPC', () => {
    const sql = readDoc('docs/05_rpc_move_items_bulk.sql')

    expect(sql).toContain('insert into public.activities')
    expect(sql).toContain("'item_moved'")
  })
})
