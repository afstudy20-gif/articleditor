'use client';

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
      </main>

      <SiteFooter />
    </div>
  );
}
