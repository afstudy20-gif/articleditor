import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#F8FAFC',
        surface: '#FFFFFF',
        primary: '#0F172A',
        secondary: '#334155',
        muted: '#64748B',
        faint: '#94A3B8',
        border: '#E2E8F0',
        teal: {
          DEFAULT: '#0F766E',
          bg: '#F0FDFA',
          dark: '#0d6b63',
        },
        red: {
          DEFAULT: '#DC2626',
          bg: '#FEF2F2',
        },
      },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['SF Mono', 'Monaco', 'Consolas', 'monospace'],
      },
      boxShadow: {
        card: '0 1px 3px rgba(0,0,0,0.07)',
      },
    },
  },
  plugins: [],
};

export default config;
