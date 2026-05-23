'use client';

import { useEffect, useState } from 'react';
import { detectLang, setLang as persistLang, type Lang, t as translate } from './index';

export function useLang(): {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (k: Parameters<typeof translate>[0]) => string;
} {
  const [lang, setLangState] = useState<Lang>('tr');
  useEffect(() => {
    setLangState(detectLang());
    const onChange = (): void => setLangState(detectLang());
    window.addEventListener('storage', onChange);
    return () => window.removeEventListener('storage', onChange);
  }, []);
  return {
    lang,
    setLang: (l: Lang) => {
      persistLang(l);
      setLangState(l);
    },
    t: (k) => translate(k, lang),
  };
}

export type Theme = 'light' | 'dark';

export function detectTheme(): Theme {
  if (typeof window === 'undefined') return 'light';
  const stored = localStorage.getItem('article-editor-theme');
  if (stored === 'light' || stored === 'dark') return stored;
  if (window.matchMedia?.('(prefers-color-scheme: dark)').matches) return 'dark';
  return 'light';
}

export function setTheme(theme: Theme): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem('article-editor-theme', theme);
  document.documentElement.setAttribute('data-theme', theme);
}

export function useTheme(): { theme: Theme; setTheme: (t: Theme) => void } {
  const [theme, setThemeState] = useState<Theme>('light');
  useEffect(() => {
    const t = detectTheme();
    setThemeState(t);
    document.documentElement.setAttribute('data-theme', t);
  }, []);
  return {
    theme,
    setTheme: (t: Theme) => {
      setTheme(t);
      setThemeState(t);
    },
  };
}
