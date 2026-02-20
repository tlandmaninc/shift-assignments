import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Public paths that don't require authentication
const publicPaths = ['/login', '/unauthorized'];

// Paths that should be proxied to the backend
const apiPaths = ['/api'];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Skip API paths - let them pass through to next.config.js rewrites
  if (apiPaths.some(path => pathname.startsWith(path))) {
    return NextResponse.next();
  }

  // Check if path is public
  const isPublicPath = publicPaths.some(path => pathname.startsWith(path));

  if (isPublicPath) {
    return NextResponse.next();
  }

  // Check for auth cookie (note: can't verify JWT here, just check presence)
  const accessToken = request.cookies.get('ect_access_token');

  if (!accessToken) {
    // Redirect to login
    const loginUrl = new URL('/login', request.url);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder assets
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.png$|.*\\.svg$|.*\\.ico$).*)',
  ],
};
