'use client';

import Link from 'next/link';
import { useLang, useTheme } from '@/lib/i18n/hooks';
import { APP_NAME, APP_AUTHOR, APP_YEAR } from '@/lib/i18n';

export function SiteHeader({
  showNav = true,
  showWorkspaceLink = true,
}: {
  showNav?: boolean;
  showWorkspaceLink?: boolean;
}): JSX.Element {
  const { lang, setLang, t } = useLang();
  const { theme, setTheme } = useTheme();
  return (
    <header className="border-b border-border bg-surface sticky top-0 z-50">
      <div className="max-w-6xl mx-auto px-6 py-3 flex items-center justify-between gap-3 flex-wrap">
        <Link href="/" className="flex items-center gap-2 font-bold text-primary shrink-0">
          <span className="w-7 h-7 rounded-md bg-primary text-teal text-xs flex items-center justify-center font-extrabold">
            AE
          </span>
          {APP_NAME}
        </Link>
        {showNav && (
          <nav className="flex items-center gap-2 flex-wrap">
            {showWorkspaceLink && (
              <Link
                href="/"
                className="text-sm font-semibold text-teal hover:underline px-3 py-1.5 rounded-md hover:bg-teal-bg"
              >
                {t('nav_workspace')} →
              </Link>
            )}
            <Link
              href="/reader"
              className="text-sm text-secondary hover:text-primary px-2 py-1.5"
            >
              PDF
            </Link>
            <Link
              href="/tutorial"
              className="text-sm text-secondary hover:text-primary px-2 py-1.5"
            >
              {t('nav_tutorial')}
            </Link>
            <Link
              href="/about"
              className="text-sm text-secondary hover:text-primary px-2 py-1.5"
            >
              {t('nav_about')}
            </Link>
            <Link
              href="/privacy"
              className="text-sm text-secondary hover:text-primary px-2 py-1.5"
            >
              {t('nav_privacy')}
            </Link>
            <span className="w-px h-5 bg-border mx-1" />
            <a
              href="/refdown-extension.zip"
              download
              className="text-xs text-secondary hover:text-teal px-2 py-1.5 inline-flex items-center gap-1"
              title={t('ext_install_tip')}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v12"/><polyline points="7 10 12 15 17 10"/><path d="M5 21h14"/></svg>
              {t('ext_title')}
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
              className="text-xs text-secondary hover:text-teal px-2 py-1.5 inline-flex items-center gap-1"
              title={t('ext_update_tip')}
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 0 1 15.5-6.36L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15.5 6.36L3 16"/><path d="M3 21v-5h5"/></svg>
              {t('ext_update')}
            </button>

            <select
              value={lang}
              onChange={(e) => setLang(e.target.value as 'tr' | 'en')}
              className="text-xs border border-border rounded px-2 py-1 bg-surface text-primary"
              title={t('lang_label')}
            >
              <option value="tr">TR</option>
              <option value="en">EN</option>
            </select>
            <button
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              className="text-xs border border-border rounded px-2 py-1 bg-surface text-primary hover:bg-slate-100"
              title={t('theme_toggle')}
            >
              {theme === 'dark' ? '☀' : '☾'}
            </button>
          </nav>
        )}
      </div>
    </header>
  );
}

export function SiteFooter(): JSX.Element {
  const { t } = useLang();
  return (
    <footer className="border-t border-border mt-12 py-8 text-center text-xs text-faint">
      <div className="max-w-4xl mx-auto px-6 space-y-2">
        <div className="flex items-center justify-center gap-3 flex-wrap">
          <Link href="/about" className="hover:text-teal">
            {t('nav_about')}
          </Link>
          <span>·</span>
          <Link href="/privacy" className="hover:text-teal">
            {t('nav_privacy')}
          </Link>
          <span>·</span>
          <Link href="/tutorial" className="hover:text-teal">
            {t('nav_tutorial')}
          </Link>
          <span>·</span>
          <a href="https://github.com/afstudy20-gif/arted" target="_blank" rel="noopener" className="hover:text-teal">
            GitHub
          </a>
        </div>
        <div>
          © {APP_YEAR} {APP_AUTHOR}
        </div>
      </div>
    </footer>
  );
}

export function RefreshAppButton(): JSX.Element {
  const { t } = useLang();
  async function onRefresh(): Promise<void> {
    if (!confirm(t('refresh_app_confirm'))) return;
    try {
      if ('serviceWorker' in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map((r) => r.unregister().catch(() => null)));
      }
      if (window.caches) {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k).catch(() => null)));
      }
    } catch (err) {
      // ignore
    }
    const url = new URL(location.href);
    url.searchParams.set('_r', Date.now().toString(36));
    location.replace(url.toString());
  }
  return (
    <button
      onClick={onRefresh}
      className="text-xs text-muted hover:text-teal px-2 py-1 border border-border rounded"
      title={t('refresh_app_desc')}
    >
      ↻ {t('refresh_app')}
    </button>
  );
}
