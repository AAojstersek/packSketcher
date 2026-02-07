import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { hasAppAccess } from '@/lib/access/entitlements'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
type CookieToSet = {
  name: string
  value: string
  options: CookieOptions
}

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({
    request,
  })

  const supabase = createServerClient(
    supabaseUrl,
    supabaseAnonKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet: CookieToSet[]) {
          cookiesToSet.forEach(({ name, value }) => {
            request.cookies.set(name, value)
          })
          response = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options)
          })
        },
      },
    }
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl
  const accessControlEnabled =
    process.env.ACCESS_CONTROL_ENABLED === 'true' ||
    process.env.NEXT_PUBLIC_ACCESS_CONTROL_ENABLED === 'true'
  const requiresAuth =
    pathname.startsWith('/dashboard') ||
    pathname.startsWith('/planner') ||
    pathname === '/subscribe' ||
    pathname === '/billing' ||
    pathname === '/access-denied'
  const isAuthScreen =
    pathname === '/login' ||
    pathname === '/signup' ||
    pathname === '/forgot-password' ||
    pathname === '/reset-password'

  if (pathname === '/') {
    const url = request.nextUrl.clone()
    url.pathname = user ? '/dashboard' : '/login'
    return NextResponse.redirect(url)
  }

  if (!user && requiresAuth) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  if (user && isAuthScreen) {
    const url = request.nextUrl.clone()
    url.pathname = '/dashboard'
    return NextResponse.redirect(url)
  }

  if (user && accessControlEnabled) {
    const canUseApp = await hasAppAccess(supabase, user)

    if ((pathname.startsWith('/dashboard') || pathname.startsWith('/planner')) && !canUseApp) {
      const url = request.nextUrl.clone()
      url.pathname = '/access-denied'
      return NextResponse.redirect(url)
    }

    if (pathname === '/access-denied' && canUseApp) {
      const url = request.nextUrl.clone()
      url.pathname = '/dashboard'
      return NextResponse.redirect(url)
    }

    if (pathname === '/subscribe' && canUseApp) {
      const url = request.nextUrl.clone()
      url.pathname = '/billing'
      return NextResponse.redirect(url)
    }
  }

  return response
}

export const config = {
  matcher: [
    '/dashboard/:path*',
    '/planner/:path*',
    '/login',
    '/signup',
    '/forgot-password',
    '/reset-password',
    '/subscribe',
    '/billing',
    '/access-denied',
    '/',
  ],
}
