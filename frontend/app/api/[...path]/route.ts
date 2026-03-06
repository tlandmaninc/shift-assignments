import { NextRequest, NextResponse } from 'next/server';

// Allow up to 3 minutes for AI chat responses (Ollama on CPU can be slow)
export const maxDuration = 180;

// Read at request time — BACKEND_URL and API_URL are runtime env vars (not inlined by Webpack).
// NEXT_PUBLIC_API_URL is inlined at build time and may be empty on Vercel.
function getBackendUrl(): string {
  return process.env.BACKEND_URL || process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
}

async function proxyRequest(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const url = `${getBackendUrl()}${pathname}${search}`;

  const headers = new Headers();
  request.headers.forEach((value, key) => {
    // Skip host header to avoid conflicts
    if (key.toLowerCase() !== 'host') {
      headers.set(key, value);
    }
  });

  try {
    // Use longer timeout for chat endpoints (Ollama on CPU can take 60-120s)
    const isChat = pathname.includes('/chat') && request.method === 'POST';
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), isChat ? 180000 : 30000);

    const response = await fetch(url, {
      method: request.method,
      headers,
      body: request.method !== 'GET' && request.method !== 'HEAD'
        ? await request.text()
        : undefined,
      redirect: 'manual', // Don't follow redirects - pass them to the browser
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

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
      if (!['content-encoding', 'content-length', 'transfer-encoding', 'set-cookie', 'cache-control', 'etag', 'last-modified', 'expires'].includes(key.toLowerCase())) {
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
