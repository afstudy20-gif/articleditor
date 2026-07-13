'use client';

/**
 * Briefcase — ad-hoc cross-device file storage in the same Drive appDataFolder
 * used by google-drive.ts's project sync, but tagged separately
 * (`appProperties.arted='briefcase'`) so it never gets pulled into project
 * JSON or confused with a project's own sync payload. For a single large
 * file (a supplementary dataset, a big scanned PDF) that a user wants on
 * another device without bloating every project sync cycle.
 *
 * Large files (> CHUNK_BYTES) are split into multiple Drive files ("parts")
 * sharing an appProperties.artedGroup id — Drive/appDataFolder multipart
 * upload has no size guarantee much above this. listBriefcase() re-groups
 * parts into one logical entry; downloadFromBriefcase() fetches every part
 * in order and reassembles them into one Blob.
 */

import { driveFetch } from './google-drive';

const CHUNK_BYTES = 95 * 1024 * 1024;
const TAG_QUERY = "appProperties has { key='arted' and value='briefcase' }";
const PART_SUFFIX_RE = /\.part\d+of\d+$/;
const UPLOAD_URL = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';

export type BriefcaseEntry = {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  modifiedTime: string;
  chunked: boolean;
  /** Present only for a single (non-chunked) file. */
  fileId?: string;
  /** Present only for a chunked file, ordered. */
  partIds?: string[];
  totalParts?: number;
  /** True when fewer parts are present on Drive than the group declares — a previous upload was interrupted. */
  incomplete?: boolean;
};

type DriveFile = {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  modifiedTime: string;
  appProperties?: Record<string, string>;
};

function baseName(partName: string): string {
  return partName.replace(PART_SUFFIX_RE, '');
}

async function uploadBlob(
  name: string,
  mimeType: string,
  blob: Blob,
  appProperties: Record<string, string>,
): Promise<{ id: string }> {
  const metadata = {
    name,
    parents: ['appDataFolder'],
    mimeType: mimeType || 'application/octet-stream',
    appProperties,
  };
  const boundary = '-------ARTEDBriefcase' + Math.random().toString(36).slice(2);
  const body = new Blob([
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`,
    `--${boundary}\r\nContent-Type: ${metadata.mimeType}\r\n\r\n`,
    blob,
    `\r\n--${boundary}--`,
  ]);
  const r = await driveFetch(UPLOAD_URL, {
    method: 'POST',
    headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
    body,
  });
  return await r.json();
}

/** Uploads one file to the briefcase, transparently chunking it if it exceeds CHUNK_BYTES. */
export async function uploadToBriefcase(
  file: File,
  onProgress?: (part: number, totalParts: number) => void,
): Promise<void> {
  const mime = file.type || 'application/octet-stream';

  if (file.size <= CHUNK_BYTES) {
    onProgress?.(1, 1);
    await uploadBlob(file.name, mime, file, { arted: 'briefcase' });
    return;
  }

  const totalParts = Math.ceil(file.size / CHUNK_BYTES);
  const groupId = 'g' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const uploaded: string[] = [];
  try {
    for (let i = 0; i < totalParts; i += 1) {
      onProgress?.(i + 1, totalParts);
      const start = i * CHUNK_BYTES;
      const chunk = file.slice(start, Math.min(start + CHUNK_BYTES, file.size));
      const partName = `${file.name}.part${i + 1}of${totalParts}`;
      const res = await uploadBlob(partName, mime, chunk, {
        arted: 'briefcase',
        artedGroup: groupId,
        artedPart: String(i + 1),
        artedParts: String(totalParts),
        artedSize: String(file.size),
        artedType: mime,
      });
      uploaded.push(res.id);
    }
  } catch (err) {
    // Best-effort rollback so a failed multi-part upload doesn't leave orphan parts on Drive.
    for (const id of uploaded) {
      await driveFetch(`/files/${id}`, { method: 'DELETE' }).catch(() => undefined);
    }
    throw err;
  }
}

/** Pure grouping of raw Drive file listings into logical briefcase entries — no network, easy to test. */
export function groupBriefcaseFiles(files: DriveFile[]): BriefcaseEntry[] {
  type PartRef = { id: string; index: number; size: number };
  const groups = new Map<string, BriefcaseEntry & { _parts: PartRef[] }>();
  const entries: BriefcaseEntry[] = [];

  for (const f of files) {
    const ap = f.appProperties || {};
    if (ap.artedGroup) {
      let g = groups.get(ap.artedGroup);
      if (!g) {
        g = {
          id: ap.artedGroup,
          name: baseName(f.name),
          mimeType: ap.artedType || f.mimeType,
          size: parseInt(ap.artedSize, 10) || 0,
          totalParts: parseInt(ap.artedParts, 10) || 0,
          modifiedTime: f.modifiedTime,
          chunked: true,
          _parts: [],
        };
        groups.set(ap.artedGroup, g);
        entries.push(g);
      }
      g._parts.push({ id: f.id, index: parseInt(ap.artedPart, 10) || 0, size: parseInt(f.size ?? '0', 10) || 0 });
      if (f.modifiedTime > g.modifiedTime) g.modifiedTime = f.modifiedTime;
    } else {
      entries.push({
        id: f.id,
        fileId: f.id,
        name: f.name,
        mimeType: f.mimeType,
        size: parseInt(f.size ?? '0', 10) || 0,
        modifiedTime: f.modifiedTime,
        chunked: false,
      });
    }
  }

  for (const g of groups.values()) {
    g._parts.sort((a, b) => a.index - b.index);
    g.partIds = g._parts.map((p) => p.id);
    g.incomplete = (g.totalParts ?? 0) > 0 ? g._parts.length !== g.totalParts : false;
    if (!g.size) g.size = g._parts.reduce((sum, p) => sum + p.size, 0);
    delete (g as { _parts?: PartRef[] })._parts;
  }

  entries.sort((a, b) => (a.modifiedTime < b.modifiedTime ? 1 : -1));
  return entries;
}

export async function listBriefcase(): Promise<BriefcaseEntry[]> {
  const q = encodeURIComponent(TAG_QUERY);
  const r = await driveFetch(
    `/files?spaces=appDataFolder&q=${q}&fields=files(id,name,mimeType,size,modifiedTime,appProperties)&pageSize=1000&orderBy=modifiedTime desc`,
  );
  const data = (await r.json()) as { files?: DriveFile[] };
  return groupBriefcaseFiles(data.files || []);
}

async function fetchBlob(fileId: string): Promise<Blob> {
  const r = await driveFetch(`/files/${fileId}?alt=media`);
  return await r.blob();
}

function partIdsOf(entry: BriefcaseEntry): string[] {
  return entry.chunked ? (entry.partIds ?? []) : [entry.fileId ?? entry.id];
}

/** Downloads and (if chunked) reassembles a briefcase entry into a single Blob. */
export async function downloadFromBriefcase(
  entry: BriefcaseEntry,
  onProgress?: (part: number, totalParts: number) => void,
): Promise<Blob> {
  if (entry.incomplete) throw new Error('Bu dosyanın parçaları eksik — yükleme yarıda kalmış olabilir.');
  const ids = partIdsOf(entry);
  if (ids.length === 1) {
    onProgress?.(1, 1);
    return await fetchBlob(ids[0]);
  }
  const blobs: Blob[] = [];
  for (let i = 0; i < ids.length; i += 1) {
    onProgress?.(i + 1, ids.length);
    blobs.push(await fetchBlob(ids[i]));
  }
  return new Blob(blobs, { type: entry.mimeType || 'application/octet-stream' });
}

export async function removeFromBriefcase(entry: BriefcaseEntry): Promise<void> {
  if (!entry.chunked) {
    await driveFetch(`/files/${entry.fileId ?? entry.id}`, { method: 'DELETE' });
    return;
  }
  for (const id of entry.partIds ?? []) {
    await driveFetch(`/files/${id}`, { method: 'DELETE' });
  }
}
