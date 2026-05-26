'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { SiteHeader, SiteFooter } from '@/components/SiteChrome';
import { useLang } from '@/lib/i18n/hooks';
import { DRTR_TOOLS, APP_NAME } from '@/lib/i18n';

export default function HomePage(): JSX.Element {
  const { t, lang } = useLang();
  const features: Array<{ key: any; icon: string }> = [
    { key: 'feat_convert', icon: '📄' },
    { key: 'feat_lookup', icon: '🔍' },
    { key: 'feat_editor', icon: '✍️' },
    { key: 'feat_styles', icon: '🎨' },
    { key: 'feat_latex', icon: 'Σ' },
    { key: 'feat_endnote', icon: '📚' },
  ];

  return (
    <div className="min-h-screen">
      <SiteHeader />

      <main className="max-w-6xl mx-auto px-6 py-8">
        <section className="text-center mb-8">
          <span className="inline-block text-xs font-bold uppercase tracking-widest text-teal bg-teal-bg px-3 py-1 rounded-full mb-3">
            {APP_NAME}
          </span>
          <h1 className="text-3xl md:text-5xl font-extrabold text-primary mb-4 leading-tight">
            {t('hero_title')}
          </h1>
          <p className="text-muted max-w-2xl mx-auto leading-relaxed mb-6">{t('hero_desc')}</p>
          <Link
            href="/edit"
            className="inline-block bg-teal text-white px-6 py-3 rounded-lg font-semibold hover:bg-teal-dark transition"
          >
            {t('hero_cta')} →
          </Link>
        </section>

        <section className="mb-8">
          <h2 className="text-lg font-bold text-primary mb-3 text-center">{t('features_title')}</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {features.map((f) => (
              <div key={f.key} className="card px-3 py-2 flex items-start gap-2">
                <span className="text-lg shrink-0">{f.icon}</span>
                <p className="text-xs text-secondary leading-snug">{t(f.key)}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mb-8">
          <h2 className="text-lg font-bold text-primary mb-1 text-center">{t('ecosystem_title')}</h2>
          <p className="text-xs text-muted text-center mb-3">{t('ecosystem_desc')}</p>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
            {DRTR_TOOLS.map((tool) => (
              <a
                key={tool.url}
                href={tool.url}
                target="_blank"
                rel="noopener"
                className="card px-3 py-2 hover:shadow-md hover:border-teal transition group"
              >
                <div className="text-sm font-bold text-primary group-hover:text-teal">{tool.name}</div>
                <div className="text-xs text-muted mt-0.5 leading-snug">{tool.desc[lang]}</div>
              </a>
            ))}
          </div>
        </section>
      </main>

      <MapMyVisitors />

      <SiteFooter />
    </div>
  );
}

function MapMyVisitors(): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || el.querySelector('script')) return;
    const s = document.createElement('script');
    s.type = 'text/javascript';
    s.id = 'mapmyvisitors';
    s.src = '//mapmyvisitors.com/map.js?d=CVIP5gbhDp6cxKGQwjlOmnvT5EWEGc1Y72AJVD5BHa8&cl=ffffff&w=a';
    el.appendChild(s);
  }, []);

  return (
    <div className="flex justify-center py-4">
      <div
        ref={containerRef}
        className="opacity-60 hover:opacity-100 transition-opacity"
        style={{ transform: 'scale(0.6)', transformOrigin: 'center' }}
      />
    </div>
  );
}
