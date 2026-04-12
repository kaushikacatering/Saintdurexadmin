import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// Define public routes that don't require authentication
const publicRoutes = ['/login']

// Define protected routes that require authentication
const protectedRoutes = ['/dashboard']

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  
  // Check if the route is protected
  const isProtectedRoute = protectedRoutes.some(route => 
    pathname.startsWith(route)
  )
  
  // Check if the route is public
  const isPublicRoute = publicRoutes.some(route => 
    pathname === route || pathname.startsWith(route)
  )
  
  // Get the auth token from cookies
  const authCookie = request.cookies.get('caterly-auth')
  
  // If trying to access protected route without authentication cookie
  // Let the page load so client-side can check localStorage
  // The dashboard layout will handle redirect if no localStorage auth either
  if (isProtectedRoute && !authCookie) {
    // Allow the page to load - client-side layout will check localStorage
    // and redirect to login if needed
    return NextResponse.next()
  }
  
  // If trying to access login while already authenticated
  // Redirect root to dashboard
  if (pathname === '/') {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  if (pathname === '/login' && authCookie) {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }
  
  return NextResponse.next()
}

// Configure which routes to run middleware on
export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     */
    '/((?!api|_next/static|_next/image|favicon.ico|assets).*)',
  ],
}

