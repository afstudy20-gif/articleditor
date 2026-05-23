import type { Metadata } from 'next';
import Script from 'next/script';
import './globals.css';

export const metadata: Metadata = {
  title: 'Article Editor — Online Academic Writing & EndNote Converter',
  description:
    'Online academic article editor. Convert plain text citations to active EndNote field codes, DOI/PubMed lookup, Vancouver/APA/AMA/IEEE styles, LaTeX export.',
  robots: 'index, follow',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="manifest" href="/manifest.webmanifest" />
        <link rel="icon" type="image/svg+xml" href="/icon.svg" />
        <meta name="theme-color" content="#0F766E" />
        <Script id="theme-init" strategy="beforeInteractive">{`
          (function(){
            try {
              var t = localStorage.getItem('article-editor-theme');
              if (!t) {
                t = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
              }
              document.documentElement.setAttribute('data-theme', t);
            } catch(e) {}
          })();
        `}</Script>
        <Script id="sw-register" strategy="afterInteractive">{`
          if ('serviceWorker' in navigator) {
            window.addEventListener('load', function () {
              navigator.serviceWorker.register('/sw.js').catch(function(){});
            });
          }
        `}</Script>
      </head>
      <body className="min-h-screen font-sans">{children}</body>
    </html>
  );
}
