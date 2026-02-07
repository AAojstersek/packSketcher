import { randomUUID } from 'node:crypto'
import { NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'

interface InviteRequestBody {
  email?: string
  expiresInDays?: number
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase()
}

function isAuthorizedAdminRequest(request: Request) {
  const expectedToken = process.env.ADMIN_INVITE_TOKEN
  if (!expectedToken) {
    return false
  }
  const token = request.headers.get('x-admin-invite-token')
  return token === expectedToken
}

function siteUrlFromRequest(request: Request): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL
  if (configured) {
    return configured.replace(/\/$/, '')
  }
  return new URL(request.url).origin
}

export async function POST(request: Request) {
  if (!isAuthorizedAdminRequest(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = (await request.json().catch(() => ({}))) as InviteRequestBody
    const rawEmail = typeof body.email === 'string' ? body.email : ''
    const email = normalizeEmail(rawEmail)

    if (!email || !email.includes('@')) {
      return NextResponse.json({ error: 'A valid email is required.' }, { status: 400 })
    }

    const expiresInDays = Number.isFinite(body.expiresInDays) ? Number(body.expiresInDays) : 30
    const expiresAt = expiresInDays > 0
      ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000).toISOString()
      : null

    const supabaseAdmin = createSupabaseAdminClient()
    const token = randomUUID()

    const { error: inviteRowError } = await supabaseAdmin
      .from('beta_invites')
      .upsert(
        {
          email_normalized: email,
          token,
          expires_at: expiresAt,
        },
        { onConflict: 'email_normalized' }
      )

    if (inviteRowError) {
      return NextResponse.json({ error: inviteRowError.message }, { status: 500 })
    }

    const { error: authInviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(
      email,
      {
        redirectTo: `${siteUrlFromRequest(request)}/login`,
      }
    )

    if (authInviteError) {
      return NextResponse.json({ error: authInviteError.message }, { status: 500 })
    }

    return NextResponse.json({
      ok: true,
      email,
      expiresAt,
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create invite.' },
      { status: 500 }
    )
  }
}
