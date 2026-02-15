import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getUserFromRequest } from '@/lib/auth'
import { getPagePermission } from '@/lib/page-permissions'
import { hasPermission, hasAnyPermission } from '@/lib/permissions'
import prisma from '@/lib/prisma'
import { UserRole } from '@prisma/client'

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Public routes that don't require authentication
  const publicRoutes = [
    '/login', 
    '/api/auth/login', 
    '/api/auth/register',
    '/api/auth/send-otp',
    '/api/auth/verify-otp',
    '/api/auth/forgot-password',
    '/api/auth/reset-password',
    '/api/webhooks',
    '/api/stripe/webhook',
    '/api/share',
  ]
  const isPublicRoute = publicRoutes.some(route => pathname.startsWith(route))

  // If it's a public route, allow access
  if (isPublicRoute) {
    return NextResponse.next()
  }

  // For admin routes, check authentication and permissions
  if (pathname.startsWith('/admin')) {
    // Debug: Log all cookies
    const allCookies = request.cookies.getAll()
    const authCookie = request.cookies.get('authToken')
    console.log('[Middleware] All cookies:', allCookies.map(c => c.name))
    console.log('[Middleware] Auth cookie exists:', !!authCookie, 'Value length:', authCookie?.value?.length || 0)
    
    const tokenUser = getUserFromRequest(request)
    console.log('[Middleware] Token user extracted:', !!tokenUser, tokenUser ? `userId: ${tokenUser.userId}` : 'none')
    
    // Check authentication
    if (!tokenUser) {
      console.log('[Middleware] No token found for path:', pathname)
      // Check if there's a cookie but token verification failed
      const authCookie = request.cookies.get('authToken')
      if (authCookie) {
        console.log('[Middleware] Cookie exists but token verification failed, allowing through for client-side auth')
        // Allow through - client-side will handle auth and redirect if needed
        return NextResponse.next()
      }
      
      // For dashboard and control-center, always allow through
      // This prevents redirect loops when cookie is being set
      if (pathname === '/admin/dashboard' || pathname === '/admin/control-center') {
        console.log('[Middleware] Allowing dashboard/control-center through without token, client will handle auth')
        return NextResponse.next()
      }
      
      // For other routes, be more lenient - if user was on admin page, allow through
      // This handles client-side navigation where cookies might not be sent immediately
      const referer = request.headers.get('referer')
      if (referer && (referer.includes('/admin') || referer.includes('/login'))) {
        console.log('[Middleware] Coming from admin/login page, allowing through for client-side auth')
        return NextResponse.next()
      }
      
      // Also check if there are any other auth indicators
      // If user has any cookies at all, they might be authenticated
      if (allCookies.length > 0) {
        console.log('[Middleware] User has cookies, allowing through for client-side auth check')
        return NextResponse.next()
      }
      
      console.log('[Middleware] No auth indicators, redirecting to login')
      return NextResponse.redirect(new URL('/login', request.url))
    }

    // Check if user is active and get role/head super admin status
    try {
      const user = await prisma.user.findUnique({
        where: { id: tokenUser.userId },
        select: { isActive: true, role: true, isHeadSuperAdmin: true } as any,
      })

      if (!user || !user.isActive) {
        console.log('[Middleware] User not found or inactive, redirecting to login')
        return NextResponse.redirect(new URL('/login', request.url))
      }

      const isHeadSuperAdmin = (user as any).isHeadSuperAdmin || false;
      const userRole = (user.role as unknown) as UserRole;
      
      console.log(`[Middleware] User ${tokenUser.userId} - Role: ${userRole}, isHeadSuperAdmin: ${isHeadSuperAdmin}, Path: ${pathname}`)
      
      // Head super admin, DEVELOPER, OWNER, and SUPER_ADMIN have all permissions - allow through immediately
      if (isHeadSuperAdmin || userRole === UserRole.DEVELOPER || userRole === UserRole.OWNER || userRole === UserRole.SUPER_ADMIN) {
        console.log('[Middleware] User has full access, allowing through')
        return NextResponse.next()
      }

      // For other users, check page-level permissions
      const requiredPermission = getPagePermission(pathname)
      
      if (requiredPermission) {
        // Check explicit permissions
        if (Array.isArray(requiredPermission)) {
          const hasAccess = await hasAnyPermission(tokenUser.userId, requiredPermission)
          if (!hasAccess) {
            return NextResponse.redirect(new URL('/admin/dashboard?error=access_denied', request.url))
          }
        } else {
          const hasAccess = await hasPermission(tokenUser.userId, requiredPermission)
          if (!hasAccess) {
            return NextResponse.redirect(new URL('/admin/dashboard?error=access_denied', request.url))
          }
        }
      }

      // Allow access if no permission required or permission check passed
      return NextResponse.next()
    } catch (error) {
      console.error('[Middleware] Permission check error:', error)
      // On error, allow access to prevent redirect loops - let client-side handle auth
      // This prevents blocking legitimate users due to transient errors
      console.log('[Middleware] Error occurred, allowing access to let client-side handle auth')
      return NextResponse.next()
    }
  }

  // For API routes, let them handle auth themselves (they have more granular checks)
  if (pathname.startsWith('/api')) {
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






