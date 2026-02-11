import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

function readMigration(relativePath: string): string {
  const fullPath = path.resolve(process.cwd(), relativePath)
  return fs.readFileSync(fullPath, 'utf8')
}

describe('access SQL contracts', () => {
  const sql = readMigration('supabase/migrations/20260211130000_harden_access_security.sql')

  it('sets app_access view to security_invoker', () => {
    expect(sql).toContain('create or replace view public.app_access')
    expect(sql).toContain('with (security_invoker = true)')
  })

  it('uses security invoker for access decision functions', () => {
    expect(sql).toContain('create or replace function public.get_access_state')
    expect(sql).toContain('create or replace function public.has_app_access')
    expect(sql).toContain('security invoker')
  })

  it('does not trust p_email as auth email source', () => {
    expect(sql).not.toMatch(/coalesce\s*\(\s*p_email\s*,\s*auth\.jwt\(\)\s*->>\s*'email'/)
  })
})
