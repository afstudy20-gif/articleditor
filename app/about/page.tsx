'use client';

import { SiteHeader, SiteFooter, RefreshAppButton } from '@/components/SiteChrome';
import { useLang } from '@/lib/i18n/hooks';
import { APP_NAME, APP_VERSION, APP_AUTHOR, APP_YEAR } from '@/lib/i18n';

export default function AboutPage(): JSX.Element {
  const { t } = useLang();
  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="max-w-3xl mx-auto px-6 py-10">
        <h1 className="text-3xl font-extrabold text-primary mb-6">{t('about_title')}</h1>
        <div className="card p-6 space-y-4">
          <div className="flex items-center gap-3">
            <span className="w-12 h-12 rounded-lg bg-primary text-teal flex items-center justify-center font-extrabold text-sm">
              AE
            </span>
            <div>
              <h2 className="text-xl font-bold text-primary">{APP_NAME}</h2>
              <p className="text-sm text-muted">
                {t('about_version')}: <span className="text-primary font-mono">{APP_VERSION}</span> · ©{' '}
                {APP_YEAR} {APP_AUTHOR}
              </p>
            </div>
          </div>

          <dl className="space-y-3 text-sm pt-3 border-t border-border">
            <div>
              <dt className="tool-label">{t('about_author')}</dt>
              <dd className="text-secondary mt-0.5">Dr. Yusuf Hoşoğlu — cardiologist, author</dd>
            </div>
            <div>
              <dt className="tool-label">{t('about_stack')}</dt>
              <dd className="text-secondary mt-0.5">
                Next.js 14 · React 18 · TypeScript · TipTap (ProseMirror) · Tailwind · Dexie (IndexedDB) · JSZip
              </dd>
            </div>
            <div>
              <dt className="tool-label">{t('about_license')}</dt>
              <dd className="text-secondary mt-0.5">{t('about_license_value')}</dd>
            </div>
            <div>
              <dt className="tool-label">Source</dt>
              <dd className="text-secondary mt-0.5">
                <a
                  href="https://github.com/afstudy20-gif/arted"
                  target="_blank"
                  rel="noopener"
                  className="text-teal hover:underline"
                >
                  github.com/afstudy20-gif/arted ↗
                </a>
              </dd>
            </div>
          </dl>

          <div className="pt-3 border-t border-border">
            <RefreshAppButton />
          </div>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
