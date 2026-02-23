import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Public paths that don't require authentication
const publicPaths = ['/login', '/unauthorized'];

// Paths that should be proxied to the backend
const apiPaths = ['/api'];

// Admin-only paths requiring role check
const adminPaths = ['/employees', '/forms', '/assignments'];

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const payload = Buffer.from(parts[1], 'base64url').toString();
    return JSON.parse(payload);
  } catch {
    return null;
  }
}

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

  // Check for auth cookie
  const accessToken = request.cookies.get('ect_access_token');

  if (!accessToken) {
    const loginUrl = new URL('/login', request.url);
    return NextResponse.redirect(loginUrl);
  }

  // Check admin role for admin-only paths
  const isAdminPath = adminPaths.some(path => pathname.startsWith(path));
  if (isAdminPath) {
    const payload = decodeJwtPayload(accessToken.value);
    if (!payload || payload.role !== 'admin') {
      const unauthorizedUrl = new URL('/unauthorized', request.url);
      return NextResponse.redirect(unauthorizedUrl);
    }
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
