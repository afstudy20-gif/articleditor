'use client';

import { useEffect, useState } from 'react';
import { resolvePdfUrl } from '@/lib/pdf/client-source';

type Props = {
  source: File | string;
};

export function BuiltInPdfViewer({ source }: Props) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;

    async function load() {
      try {
        if (typeof source === 'string') {
          const resolved = await resolvePdfUrl(source);
          if (!cancelled) setUrl(resolved);
        } else {
          objectUrl = URL.createObjectURL(source);
          if (!cancelled) setUrl(objectUrl);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'PDF yüklenemedi');
        }
      }
    }

    load();
    return () => {
      cancelled = true;
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [source]);

  if (error) {
    return (
      <div className="flex h-full items-center justify-center p-10 text-center text-red-600">
        {error}
      </div>
    );
  }

  if (!url) {
    return (
      <div className="flex h-full items-center justify-center p-10 text-center text-gray-400">
        Loading PDF…
      </div>
    );
  }

  return (
    <iframe
      src={url}
      title="PDF"
      className="h-full w-full border-0"
    />
  );
}
