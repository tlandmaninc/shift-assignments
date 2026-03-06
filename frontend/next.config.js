/** @type {import('next').NextConfig} */ // v2
const nextConfig = {
  reactStrictMode: true,
  turbopack: {},
  webpack: (config, { dev }) => {
    if (dev) {
      config.watchOptions = {
        poll: 1000,
        aggregateTimeout: 300,
      };
    }
    return config;
  },
  async headers() {
    const isProd = process.env.NODE_ENV === 'production';
    // Firebase Phone Auth + reCAPTCHA domains
    const firebaseScript = 'https://www.gstatic.com/recaptcha/ https://www.google.com/recaptcha/';
    const firebaseConnect = [
      'https://identitytoolkit.googleapis.com',
      'https://securetoken.googleapis.com',
      'https://www.googleapis.com',
      'https://firebase.googleapis.com',
    ].join(' ');
    const firebaseFrame = 'https://www.google.com/recaptcha/ https://*.firebaseapp.com';

    const cspScriptSrc = isProd
      ? `'self' 'unsafe-inline' ${firebaseScript}`
      : `'self' 'unsafe-eval' 'unsafe-inline' ${firebaseScript}`;
    const csp = [
      "default-src 'self'",
      `script-src ${cspScriptSrc}`,
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: https:",
      isProd
        ? `connect-src 'self' ${firebaseConnect}`
        : `connect-src 'self' http://localhost:8000 ws://localhost:8000 ${firebaseConnect}`,
      `frame-src ${firebaseFrame}`,
      "frame-ancestors 'none'",
    ].join('; ');

    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Cache-Control', value: 'no-store, no-cache, must-revalidate, proxy-revalidate' },
          { key: 'Pragma', value: 'no-cache' },
          { key: 'Expires', value: '0' },
          { key: 'Content-Security-Policy', value: csp },
        ],
      },
    ];
  },
  async rewrites() {
    // In Docker/local dev, proxy API calls at the Next.js level.
    // On Vercel, app/api/[...path]/route.ts handles this as a serverless function.
    const backendUrl = process.env.BACKEND_URL;
    if (!backendUrl) return [];
    return [
      {
        source: '/api/:path*',
        destination: `${backendUrl}/api/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;
