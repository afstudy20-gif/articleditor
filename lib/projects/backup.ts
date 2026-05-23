import type { Project } from '@/store/types';

export type Backup = {
  version: 1;
  exported: string;
  projects: Project[];
};

export function buildBackup(projects: Project[]): Backup {
  return {
    version: 1,
    exported: new Date().toISOString(),
    projects,
  };
}

export function backupToBlob(backup: Backup): Blob {
  return new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
}

export function parseBackup(raw: string): Backup {
  const data = JSON.parse(raw) as unknown;
  if (!data || typeof data !== 'object') throw new Error('Yedek geçersiz: kök obje yok');
  const d = data as Record<string, unknown>;
  if (!Array.isArray(d.projects) && !Array.isArray((d as { notes?: unknown }).notes)) {
    throw new Error('Yedek geçersiz: projects/notes alanı yok');
  }
  const projects = (Array.isArray(d.projects) ? d.projects : (d as { notes?: unknown[] }).notes) as Project[];
  return {
    version: (d.version as 1) ?? 1,
    exported: (d.exported as string) ?? new Date().toISOString(),
    projects,
  };
}

export function projectFilename(project: Project): string {
  const slug =
    project.title
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 60) || 'proje';
  return `article-editor-${slug}-${new Date().toISOString().slice(0, 10)}.json`;
}

export function backupFilename(): string {
  return `article-editor-backup-${new Date().toISOString().slice(0, 10)}.json`;
}
