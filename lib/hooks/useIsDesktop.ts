'use client';

import { useEffect, useState } from 'react';

const QUERY = '(min-width: 1024px)'; // Tailwind lg breakpoint

/**
 * True when the viewport is at or above the lg breakpoint. Used to mount a
 * single editor instance instead of rendering desktop + mobile layouts
 * simultaneously (two live TipTap instances would race on content).
 * Starts as `true` during SSR; corrected on mount.
 */
export function useIsDesktop(): boolean {
  const [isDesktop, setIsDesktop] = useState(true);

  useEffect(() => {
    const mq = window.matchMedia(QUERY);
    const update = (): void => setIsDesktop(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  return isDesktop;
}
