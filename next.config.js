// Content-Security-Policy. Allowances map to real app needs:
//  - accounts.google.com script/frame/connect → Google Drive sync (GSI client)
//  - www.googleapis.com connect               → Drive file transfer
//  - blob:/data: img + worker                 → pdf.js rendering, figure previews
//  - 'unsafe-inline' script/style             → Next.js runtime + Tailwind; dev
//    additionally needs 'unsafe-eval' for HMR.
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${
    process.env.NODE_ENV === 'development' ? " 'unsafe-eval'" : ''
  } https://accounts.google.com`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://*.googleusercontent.com",
  "font-src 'self' data:",
  "connect-src 'self' https://www.googleapis.com https://accounts.google.com",
  "frame-src https://accounts.google.com",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'self'",
].join('; ');

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: csp },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
    ];
  },
  // pdfjs-dist >=5 no longer pulls the native `canvas` package, so the old
  // webpack `canvas: false` alias (Alpine build fix) is no longer needed and
  // the config stays Turbopack-compatible.
  turbopack: {
    root: __dirname,
  },
};

module.exports = nextConfig;
