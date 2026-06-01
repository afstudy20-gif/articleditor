/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  poweredByHeader: false,
  webpack: (config) => {
    // pdfjs-dist (phrasebank PDF importer) optionally requires the native
    // `canvas` package for Node-side rendering. It installs on macOS but not on
    // Alpine (no build toolchain), so the Coolify build failed with
    // "Module not found: Can't resolve 'canvas'". We never render PDFs on the
    // server — resolve it to an empty module so the bundle never needs it.
    config.resolve.alias = { ...config.resolve.alias, canvas: false };
    return config;
  },
};

module.exports = nextConfig;
