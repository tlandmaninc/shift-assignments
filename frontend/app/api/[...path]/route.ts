import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = process.env.BACKEND_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

async function proxyRequest(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const url = `${BACKEND_URL}${pathname}${search}`;

  const headers = new Headers();
  request.headers.forEach((value, key) => {
    // Skip host header to avoid conflicts
    if (key.toLowerCase() !== 'host') {
      headers.set(key, value);
    }
  });

  try {
    const response = await fetch(url, {
      method: request.method,
      headers,
      body: request.method !== 'GET' && request.method !== 'HEAD'
        ? await request.text()
        : undefined,
      redirect: 'manual', // Don't follow redirects - pass them to the browser
    });

    // Handle Set-Cookie headers specially - they must not be combined
    // getSetCookie() returns an array of individual Set-Cookie header values
    const setCookies = response.headers.getSetCookie();

    // Handle redirect responses specially to ensure cookies are properly set
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (location) {
        const redirectResponse = NextResponse.redirect(location, response.status);
        // Copy cookies to the redirect response
        setCookies.forEach((cookie) => {
          redirectResponse.headers.append('Set-Cookie', cookie);
        });
        return redirectResponse;
      }
    }

    const responseHeaders = new Headers();

    setCookies.forEach((cookie) => {
      responseHeaders.append('Set-Cookie', cookie);
    });

    // Forward all other headers
    response.headers.forEach((value, key) => {
      // Skip headers that cause issues or are handled separately
      if (!['content-encoding', 'transfer-encoding', 'set-cookie'].includes(key.toLowerCase())) {
        responseHeaders.set(key, value);
      }
    });

    const body = await response.text();

    return new NextResponse(body, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
    });
  } catch (error) {
    console.error('Proxy error:', error);
    return NextResponse.json(
      { error: 'Backend server unavailable' },
      { status: 502 }
    );
  }
}

export async function GET(request: NextRequest) {
  return proxyRequest(request);
}

export async function POST(request: NextRequest) {
  return proxyRequest(request);
}

export async function PUT(request: NextRequest) {
  return proxyRequest(request);
}

export async function DELETE(request: NextRequest) {
  return proxyRequest(request);
}

export async function PATCH(request: NextRequest) {
  return proxyRequest(request);
}
