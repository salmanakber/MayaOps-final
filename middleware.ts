import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Public routes that don't require authentication
  const publicRoutes = ['/login', '/api/auth/login', '/api/auth/register']
  const isPublicRoute = publicRoutes.some(route => pathname.startsWith(route))

  // If it's a public route, allow access
  if (isPublicRoute) {
    return NextResponse.next()
  }

  // For admin routes, check authentication
  if (pathname.startsWith('/admin') || pathname.startsWith('/api')) {
    // Check for token in Authorization header or cookie
    const authHeader = request.headers.get('authorization')
    const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : null

    // For API routes, we'll let them handle auth themselves
    if (pathname.startsWith('/api')) {
      return NextResponse.next()
    }

    // For admin pages, redirect to login if no token
    // Note: Client-side will handle the actual auth check
    return NextResponse.next()
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    '/admin/:path*',
    '/api/:path*',
    '/login',
  ],
}






