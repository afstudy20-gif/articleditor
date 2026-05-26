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

      <main className="max-w-6xl mx-auto px-6 py-12">
        <section className="text-center mb-12">
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

        <section className="mb-12">
          <h2 className="text-xl font-bold text-primary mb-4 text-center">{t('features_title')}</h2>
          <div className="grid md:grid-cols-3 gap-4">
            {features.map((f) => (
              <div key={f.key} className="card p-4">
                <div className="text-2xl mb-2">{f.icon}</div>
                <p className="text-sm text-secondary leading-relaxed">{t(f.key)}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mb-12">
          <h2 className="text-xl font-bold text-primary mb-1 text-center">{t('ecosystem_title')}</h2>
          <p className="text-sm text-muted text-center mb-4">{t('ecosystem_desc')}</p>
          <div className="grid sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {DRTR_TOOLS.map((tool) => (
              <a
                key={tool.url}
                href={tool.url}
                target="_blank"
                rel="noopener"
                className="card p-3 hover:shadow-md hover:border-teal transition group"
              >
                <div className="font-bold text-primary group-hover:text-teal">{tool.name}</div>
                <div className="text-xs text-muted mt-0.5">{tool.desc[lang]}</div>
                <div className="text-xs text-teal mt-2 truncate">{tool.url}</div>
              </a>
            ))}
          </div>
        </section>
        <section className="mb-12">
          <div className="max-w-xl mx-auto">
            <h2 className="text-xl font-bold text-primary mb-4 text-center">{t('ext_title')}</h2>
            <div className="card p-5 text-center">
              <p className="text-sm text-secondary mb-4">{t('ext_desc')}</p>
              <div className="flex flex-wrap gap-3 justify-center">
                <a
                  href="/refdown-extension.zip"
                  download
                  className="inline-flex items-center gap-2 bg-teal text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-teal-dark transition"
                  title={t('ext_install_tip')}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v12"/><polyline points="7 10 12 15 17 10"/><path d="M5 21h14"/></svg>
                  {t('ext_download')}
                </a>
                <button
                  onClick={() => {
                    if ('serviceWorker' in navigator) {
                      navigator.serviceWorker.getRegistrations().then((regs) => {
                        regs.forEach((r) => r.unregister());
                      });
                    }
                    if ('caches' in window) {
                      caches.keys().then((names) => {
                        names.forEach((n) => caches.delete(n));
                      });
                    }
                    setTimeout(() => window.location.reload(), 300);
                  }}
                  className="inline-flex items-center gap-2 border border-border text-secondary px-4 py-2 rounded-lg text-sm font-semibold hover:text-primary hover:border-teal transition"
                  title={t('ext_update_tip')}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 0 1 15.5-6.36L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15.5 6.36L3 16"/><path d="M3 21v-5h5"/></svg>
                  {t('ext_update')}
                </button>
              </div>
              <p className="text-xs text-muted mt-3">{t('ext_install_tip')}</p>
            </div>
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
