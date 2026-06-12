'use client';

import { createContext, createElement, useContext, useEffect, useState, type ReactNode } from 'react';
import { detectLang, setLang as persistLang, type Lang, t as translate } from './index';

interface LangContextValue {
  lang: Lang;
  setLang: (l: Lang) => void;
}

const LangContext = createContext<LangContextValue | null>(null);

function applyLang(l: Lang): void {
  persistLang(l);
  if (typeof window !== 'undefined') {
    document.documentElement.lang = l;
    window.dispatchEvent(new Event('enr:langchange'));
  }
}

/**
 * Single source of truth for the UI language. Holding one state for the whole
 * tree means a language change re-renders every consumer atomically — avoiding
 * the per-component effect races that previously left some strings (tooltips,
 * placeholders) stuck in the prior locale after the initial tr→detected flip.
 */
export function LangProvider({ children }: { children: ReactNode }): ReactNode {
  const [lang, setLangState] = useState<Lang>('tr');
  useEffect(() => {
    setLangState(detectLang());
    const onChange = (): void => setLangState(detectLang());
    window.addEventListener('storage', onChange);
    window.addEventListener('enr:langchange', onChange);
    return () => {
      window.removeEventListener('storage', onChange);
      window.removeEventListener('enr:langchange', onChange);
    };
  }, []);
  const setLang = (l: Lang): void => {
    applyLang(l);
    setLangState(l);
  };
  return createElement(LangContext.Provider, { value: { lang, setLang } }, children);
}

export function useLang(): {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (k: Parameters<typeof translate>[0]) => string;
} {
  const ctx = useContext(LangContext);
  // Fallback state for any consumer rendered outside the provider. Hooks are
  // always called (rules-of-hooks); the values are ignored when ctx exists.
  const [fallbackLang, setFallbackLang] = useState<Lang>('tr');
  useEffect(() => {
    if (ctx) return undefined;
    setFallbackLang(detectLang());
    const onChange = (): void => setFallbackLang(detectLang());
    window.addEventListener('storage', onChange);
    window.addEventListener('enr:langchange', onChange);
    return () => {
      window.removeEventListener('storage', onChange);
      window.removeEventListener('enr:langchange', onChange);
    };
  }, [ctx]);

  const lang = ctx ? ctx.lang : fallbackLang;
  const setLang = ctx
    ? ctx.setLang
    : (l: Lang): void => {
        applyLang(l);
        setFallbackLang(l);
      };
  return { lang, setLang, t: (k) => translate(k, lang) };
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
