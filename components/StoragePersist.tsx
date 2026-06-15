'use client';

import { useEffect } from 'react';

/**
 * Requests persistent storage so the browser does not evict IndexedDB (projects,
 * notes, annotations, the workspace folder handle) under disk pressure. No-op
 * when already granted or unsupported. Mounted once, app-wide.
 */
export function StoragePersist() {
  useEffect(() => {
    const storage = navigator.storage;
    if (!storage?.persist) return;
    storage
      .persisted?.()
      .then((already) => {
        if (!already) storage.persist().catch(() => {});
      })
      .catch(() => {});
  }, []);

  return null;
}
