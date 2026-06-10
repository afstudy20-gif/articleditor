/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  poweredByHeader: false,
  // pdfjs-dist >=5 no longer pulls the native `canvas` package, so the old
  // webpack `canvas: false` alias (Alpine build fix) is no longer needed and
  // the config stays Turbopack-compatible.
  turbopack: {
    root: __dirname,
  },
};

module.exports = nextConfig;
