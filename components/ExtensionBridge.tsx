'use client';

import { useEffect } from 'react';
import { setupExtensionBridge } from '@/lib/extension-bridge';

export function ExtensionBridge(): null {
  useEffect(() => {
    setupExtensionBridge();
  }, []);
  return null;
}
