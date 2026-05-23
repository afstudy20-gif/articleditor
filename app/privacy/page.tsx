'use client';

import { SiteHeader, SiteFooter } from '@/components/SiteChrome';
import { useLang } from '@/lib/i18n/hooks';

export default function PrivacyPage(): JSX.Element {
  const { t } = useLang();
  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="max-w-3xl mx-auto px-6 py-10">
        <h1 className="text-3xl font-extrabold text-primary mb-3">🔒 {t('privacy_title')}</h1>
        <p className="text-secondary leading-relaxed mb-6">{t('privacy_intro')}</p>

        <div className="space-y-4">
          <PrivacyCard
            icon="💾"
            title={t('privacy_local_title')}
            desc={t('privacy_local_desc')}
          />
          <PrivacyCard
            icon="🔎"
            title={t('privacy_lookup_title')}
            desc={t('privacy_lookup_desc')}
          />
          <PrivacyCard
            icon="🤖"
            title={t('privacy_ai_title')}
            desc={t('privacy_ai_desc')}
          />
          <PrivacyCard
            icon="📤"
            title={t('privacy_export_title')}
            desc={t('privacy_export_desc')}
          />

          <div className="card p-4 border-teal bg-teal-bg/40 text-sm text-primary font-semibold text-center">
            ✓ {t('privacy_no_tracking')}
          </div>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}

function PrivacyCard({ icon, title, desc }: { icon: string; title: string; desc: string }): JSX.Element {
  return (
    <div className="card p-5">
      <h3 className="font-bold text-primary mb-2 flex items-center gap-2">
        <span className="text-xl">{icon}</span>
        {title}
      </h3>
      <p className="text-sm text-secondary leading-relaxed">{desc}</p>
    </div>
  );
}
