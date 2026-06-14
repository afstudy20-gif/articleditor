import type { PlagiarismResult } from './copyleaks';

const STORE_KEY = '__articleEditorIntegrityScans';
const MAX_SCANS = 100;

type GlobalWithStore = typeof globalThis & {
  [STORE_KEY]?: Map<string, PlagiarismResult>;
};

function store(): Map<string, PlagiarismResult> {
  const root = globalThis as GlobalWithStore;
  root[STORE_KEY] ??= new Map<string, PlagiarismResult>();
  return root[STORE_KEY];
}

export function setPlagiarismResult(result: PlagiarismResult): void {
  const scans = store();
  scans.set(result.scanId, result);
  if (scans.size <= MAX_SCANS) return;
  const oldest = [...scans.values()]
    .sort((a, b) => a.updatedAt.localeCompare(b.updatedAt))
    .slice(0, scans.size - MAX_SCANS);
  for (const item of oldest) scans.delete(item.scanId);
}

export function getPlagiarismResult(scanId: string): PlagiarismResult | null {
  return store().get(scanId) ?? null;
}
