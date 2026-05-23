'use client';

import Link from 'next/link';
import { SiteHeader, SiteFooter } from '@/components/SiteChrome';
import { useLang } from '@/lib/i18n/hooks';

export default function TutorialPage(): JSX.Element {
  const { t } = useLang();
  const steps: Array<{ titleKey: any; descKey: any }> = [
    { titleKey: 'tutorial_step1_title', descKey: 'tutorial_step1_desc' },
    { titleKey: 'tutorial_step2_title', descKey: 'tutorial_step2_desc' },
    { titleKey: 'tutorial_step3_title', descKey: 'tutorial_step3_desc' },
    { titleKey: 'tutorial_step4_title', descKey: 'tutorial_step4_desc' },
    { titleKey: 'tutorial_step5_title', descKey: 'tutorial_step5_desc' },
  ];
  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="max-w-3xl mx-auto px-6 py-10">
        <h1 className="text-3xl font-extrabold text-primary mb-6">🎓 {t('tutorial_title')}</h1>
        <ol className="space-y-4">
          {steps.map((s, i) => (
            <li key={i} className="card p-5">
              <h3 className="font-bold text-primary mb-2">{t(s.titleKey)}</h3>
              <p className="text-sm text-secondary leading-relaxed">{t(s.descKey)}</p>
            </li>
          ))}
        </ol>
        <div className="mt-8 text-center">
          <Link
            href="/edit"
            className="inline-block bg-teal text-white px-6 py-3 rounded-lg font-semibold hover:bg-teal-dark transition"
          >
            {t('hero_cta')} →
          </Link>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
