'use client';

import { getDb } from '@/store/db';
import type { Project } from '@/store/types';

const CLIENT_ID = '866965837196-e30js8ltie1pirn0ohuv3is2uhcecmd3.apps.googleusercontent.com';
const SCOPE = 'https://www.googleapis.com/auth/drive.appdata https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile';
const DRIVE_API = 'https://www.googleapis.com/drive/v3';
const DRIVE_UPLOAD = 'https://www.googleapis.com/upload/drive/v3';

const LS_TOKEN = 'gdrive_sync_token';
const LS_USER = 'gdrive_sync_user';
const LS_LAST_SYNC = 'gdrive_sync_last_sync';
const LS_MODE = 'gdrive_sync_mode';

export type SyncStatus = 'idle' | 'syncing' | 'ok' | 'error' | 'setupNeeded';

export interface SyncState {
  signedIn: boolean;
  status: SyncStatus;
  message: string;
  user: {
    email?: string;
    name?: string;
    picture?: string;
  } | null;
  lastSync: number | null;
}

let tokenClient: any = null;
let accessToken: string | null = null;
let tokenExpiresAt = 0;
let userInfo: SyncState['user'] = null;
let signedIn = false;
let authMode = 'popup';
let syncStatus: SyncStatus = 'idle';
let statusMsg = '';
let inFlight = false;
let pushTimer: any = null;
let pullTimer: any = null;

const listeners: Array<(state: SyncState) => void> = [];

function getStatus(): SyncState {
  if (typeof window !== 'undefined') {
    const last = localStorage.getItem(LS_LAST_SYNC);
    return {
      signedIn,
      status: syncStatus,
      message: statusMsg,
      user: userInfo,
      lastSync: last ? parseInt(last, 10) : null,
    };
  }
  return {
    signedIn: false,
    status: 'idle',
    message: '',
    user: null,
    lastSync: null,
  };
}

function emit() {
  const state = getStatus();
  listeners.forEach((fn) => {
    try {
      fn(state);
    } catch (e) {
      console.warn('[sync] Listener error', e);
    }
  });
}

export function onChange(fn: (state: SyncState) => void): () => void {
  listeners.push(fn);
  fn(getStatus());
  return () => {
    const idx = listeners.indexOf(fn);
    if (idx !== -1) listeners.splice(idx, 1);
  };
}

function setStatus(s: SyncStatus, msg = '') {
  syncStatus = s;
  statusMsg = msg;
  emit();
}

function persistToken() {
  if (typeof window === 'undefined') return;
  if (accessToken && tokenExpiresAt > Date.now()) {
    localStorage.setItem(LS_TOKEN, JSON.stringify({ t: accessToken, e: tokenExpiresAt }));
    localStorage.setItem(LS_MODE, authMode);
  } else {
    localStorage.removeItem(LS_TOKEN);
  }
}

function restoreToken(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const raw = localStorage.getItem(LS_TOKEN);
    if (!raw) return false;
    const { t, e } = JSON.parse(raw);
    if (!t || !e || e <= Date.now() + 60000) return false;
    accessToken = t;
    tokenExpiresAt = e;
    return true;
  } catch {
    return false;
  }
}

function restoreUser(): SyncState['user'] {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(LS_USER);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function ensureGISLoaded(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined') {
      reject(new Error('Browser environment required'));
      return;
    }
    if ((window as any).google?.accounts?.oauth2) {
      resolve();
      return;
    }
    let waited = 0;
    const poll = setInterval(() => {
      if ((window as any).google?.accounts?.oauth2) {
        clearInterval(poll);
        resolve();
      } else if ((waited += 100) > 10000) {
        clearInterval(poll);
        reject(new Error('GIS client failed to load'));
      }
    }, 100);
  });
}

async function initTokenClient() {
  await ensureGISLoaded();
  tokenClient = (window as any).google.accounts.oauth2.initTokenClient({
    client_id: CLIENT_ID,
    scope: SCOPE,
    callback: (resp: any) => {
      if (resp.error) {
        console.error('[sync] token error', resp);
        setStatus('error', resp.error_description || resp.error);
        signedIn = false;
        return;
      }
      accessToken = resp.access_token;
      tokenExpiresAt = Date.now() + (resp.expires_in - 60) * 1000;
      signedIn = true;
      authMode = 'popup';
      persistToken();
      fetchUserInfo().then(() => {
        setStatus('syncing', 'Senkronize ediliyor...');
        syncNow().catch((e) => setStatus('error', e.message));
        startBackgroundPull();
      });
    },
    error_callback: (err: any) => {
      console.warn('[sync] GIS error', err);
      setStatus('idle', err?.type || 'yetkilendirme iptal edildi');
    },
  });
}

async function fetchUserInfo() {
  try {
    const r = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (r.ok) {
      userInfo = await r.json();
      localStorage.setItem(LS_USER, JSON.stringify(userInfo));
      return;
    }
  } catch (e) {
    console.warn('[sync] userinfo fetch failed', e);
  }
  try {
    const r = await driveFetch('/about?fields=user');
    const data = await r.json();
    if (data?.user) {
      userInfo = {
        email: data.user.emailAddress,
        name: data.user.displayName,
        picture: data.user.photoLink,
      };
      localStorage.setItem(LS_USER, JSON.stringify(userInfo));
    }
  } catch (e) {
    console.warn('[sync] userinfo fallback failed', e);
  }
}

async function refreshToken() {
  if (!CLIENT_ID) throw new Error('Client ID missing');
  await ensureGISLoaded();
  if (!tokenClient) await initTokenClient();
  await new Promise<void>((resolve, reject) => {
    const prev = tokenClient.callback;
    const timeoutId = setTimeout(() => {
      tokenClient.callback = prev;
      reject(new Error('Silent token refresh timed out'));
    }, 5000);

    tokenClient.callback = (resp: any) => {
      clearTimeout(timeoutId);
      tokenClient.callback = prev;
      if (resp.error) {
        reject(new Error(resp.error));
        return;
      }
      accessToken = resp.access_token;
      tokenExpiresAt = Date.now() + (resp.expires_in - 60) * 1000;
      authMode = 'popup';
      persistToken();
      resolve();
    };
    tokenClient.requestAccessToken({ prompt: '' });
  });
}

async function driveFetch(path: string, init?: RequestInit): Promise<Response> {
  if (!accessToken) throw new Error('Oturum açılmadı');
  if (tokenExpiresAt && tokenExpiresAt <= Date.now()) {
    await refreshToken();
  }
  const opts = init || {};
  opts.headers = Object.assign({}, opts.headers || {}, {
    Authorization: `Bearer ${accessToken}`,
  });
  const url = path.startsWith('http') ? path : (DRIVE_API + path);
  let r = await fetch(url, opts);
  if (r.status === 401) {
    try {
      await refreshToken();
      (opts.headers as any).Authorization = `Bearer ${accessToken}`;
      r = await fetch(url, opts);
    } catch {
      signedIn = false;
      localStorage.removeItem(LS_TOKEN);
      setStatus('idle', 'Tekrar giriş yapmalısınız');
      throw new Error('Token rejected (401), sign-in required');
    }
  }
  if (!r.ok) {
    const errText = await r.text().catch(() => '');
    throw new Error(`Drive ${r.status}: ${errText.slice(0, 200)}`);
  }
  return r;
}

async function listAppData(): Promise<any[]> {
  const r = await driveFetch('/files?spaces=appDataFolder&fields=files(id,name,modifiedTime,size)&pageSize=1000');
  const data = await r.json();
  return data.files || [];
}

async function downloadJson(fileId: string): Promise<any> {
  const r = await driveFetch(`/files/${fileId}?alt=media`);
  return await r.json();
}

async function uploadJson(name: string, json: any, existingFileId?: string | null): Promise<any> {
  const meta = existingFileId
    ? { name }
    : { name, parents: ['appDataFolder'], mimeType: 'application/json' };
  const boundary = '-------GDriveSync' + Math.random().toString(36).slice(2);
  const body =
    `--${boundary}\r\n` +
    `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
    JSON.stringify(meta) + `\r\n` +
    `--${boundary}\r\n` +
    `Content-Type: application/json\r\n\r\n` +
    JSON.stringify(json) + `\r\n` +
    `--${boundary}--`;
  const path = existingFileId
    ? `${DRIVE_UPLOAD}/files/${existingFileId}?uploadType=multipart`
    : `${DRIVE_UPLOAD}/files?uploadType=multipart`;
  const r = await driveFetch(path, {
    method: existingFileId ? 'PATCH' : 'POST',
    headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
    body,
  });
  return await r.json();
}

async function deleteFile(fileId: string): Promise<void> {
  try {
    await driveFetch(`/files/${fileId}`, { method: 'DELETE' });
  } catch (e) {
    console.warn('[sync] delete failed', fileId, e);
  }
}

// ---------- Sync Logic ----------

async function pull(): Promise<{ pulled: number }> {
  const db = getDb();
  const files = await listAppData();
  const indexFile = files.find((f) => f.name === 'project-index.json');
  if (!indexFile) return { pulled: 0 };

  const remoteIndex = await downloadJson(indexFile.id);
  const remoteProjects = (remoteIndex.projects || []) as any[];

  const localProjects = await db.projects.toArray();
  const localMap = new Map(localProjects.map((p) => [p.id, p]));
  const fileMap = new Map(files.map((f) => [f.name, f]));
  let pulledCount = 0;

  for (const rp of remoteProjects) {
    const loc = localMap.get(rp.id);
    const isRemoteNewer = !loc || (rp.updated || 0) > (loc.updatedAt || 0);
    if (!isRemoteNewer) continue;

    if (rp.deleted) {
      if (rp.deleted === 1) {
        await db.projects.delete(rp.id);
      } else if (loc) {
        loc.deleted = rp.deleted;
        loc.updatedAt = rp.updated;
        await db.projects.put(loc);
      } else {
        await db.projects.put({
          id: rp.id,
          title: 'Silinmiş Proje',
          createdAt: rp.updated,
          updatedAt: rp.updated,
          refs: [],
          deleted: rp.deleted,
        });
      }
      pulledCount++;
      continue;
    }

    const pFile = fileMap.get(`project-${rp.id}.json`);
    if (!pFile) continue;

    try {
      const fullProject = await downloadJson(pFile.id);
      await db.projects.put(fullProject);
      pulledCount++;
    } catch (e) {
      console.warn('[sync] pull project failed', rp.id, e);
    }
  }

  return { pulled: pulledCount };
}

async function push(): Promise<{ pushed: number }> {
  const db = getDb();
  const files = await listAppData();
  const indexFile = files.find((f) => f.name === 'project-index.json');
  const remoteIndex = indexFile ? await downloadJson(indexFile.id) : { version: 1, projects: [] };

  const remoteMap = new Map<string, any>((remoteIndex.projects || []).map((r: any) => [r.id, r]));
  const fileMap = new Map(files.map((f) => [f.name, f]));

  const localProjects = await db.projects.toArray();
  let pushedCount = 0;

  for (const lp of localProjects) {
    const rp: any = remoteMap.get(lp.id);
    const isLocalNewer = !rp || (lp.updatedAt || 0) > (rp.updated || 0);
    if (!isLocalNewer) continue;

    const fname = `project-${lp.id}.json`;
    const existingFile = fileMap.get(fname);

    if (lp.deleted) {
      if (existingFile) {
        try {
          await deleteFile(existingFile.id);
          fileMap.delete(fname);
        } catch (e) {
          console.warn('[sync] failed to delete project file from Drive', lp.id, e);
        }
      }
      remoteMap.set(lp.id, {
        id: lp.id,
        updated: lp.updatedAt || Date.now(),
        deleted: lp.deleted,
      });
      pushedCount++;
      continue;
    }

    try {
      const uploaded = await uploadJson(fname, lp, existingFile ? existingFile.id : null);
      remoteMap.set(lp.id, {
        id: lp.id,
        updated: lp.updatedAt || Date.now(),
        deleted: null,
        rev: uploaded.id,
      });
      pushedCount++;
    } catch (e) {
      console.warn('[sync] push project failed', lp.id, e);
    }
  }

  // Prune tombstones older than 30 days
  const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
  for (const [id, rp] of remoteMap.entries()) {
    if (rp.deleted && rp.updated < thirtyDaysAgo) remoteMap.delete(id);
  }

  // Prune local tombstones
  for (const lp of localProjects) {
    if (lp.deleted === 1) {
      await db.projects.delete(lp.id);
    } else if (lp.deleted && typeof lp.deleted === 'number' && lp.deleted < thirtyDaysAgo) {
      await db.projects.delete(lp.id);
    }
  }

  const newIndex = {
    version: 1,
    lastSync: Date.now(),
    projects: Array.from(remoteMap.values()),
  };

  try {
    await uploadJson('project-index.json', newIndex, indexFile ? indexFile.id : null);
  } catch (e) {
    console.warn('[sync] push index failed', e);
  }

  return { pushed: pushedCount };
}

export async function syncNow(): Promise<void> {
  if (!signedIn) return;
  if (inFlight) return;
  inFlight = true;
  setStatus('syncing');
  try {
    const p1 = await pull();
    const p2 = await push();
    if (typeof window !== 'undefined') {
      localStorage.setItem(LS_LAST_SYNC, String(Date.now()));
    }
    setStatus('ok', `Alındı: ${p1.pulled}, Gönderildi: ${p2.pushed}`);
  } catch (e: any) {
    console.error('[sync] sync error', e);
    setStatus('error', e.message || String(e));
  } finally {
    inFlight = false;
  }
}

export function markDirty(projectId?: string) {
  if (!signedIn) return;
  clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    syncNow().catch((e) => console.warn('[sync] debounced sync failed', e));
  }, 5000);
}

function startBackgroundPull() {
  clearInterval(pullTimer);
  pullTimer = setInterval(() => {
    if (!signedIn || !navigator.onLine || inFlight) return;
    syncNow().catch((e) => console.warn('[sync] bg pull failed', e));
  }, 60000);
}

export async function signIn() {
  if (typeof window === 'undefined') return;
  try {
    if (!tokenClient) await initTokenClient();
    tokenClient.requestAccessToken({ prompt: signedIn ? '' : 'consent' });
  } catch (e) {
    console.warn('[sync] sign in failed', e);
  }
}

export async function signOut() {
  if (typeof window === 'undefined') return;
  if (accessToken && (window as any).google?.accounts?.oauth2) {
    try {
      (window as any).google.accounts.oauth2.revoke(accessToken, () => {});
    } catch (_) {}
  }
  accessToken = null;
  tokenExpiresAt = 0;
  signedIn = false;
  userInfo = null;
  localStorage.removeItem(LS_TOKEN);
  localStorage.removeItem(LS_USER);
  clearTimeout(pushTimer);
  clearInterval(pullTimer);
  pullTimer = null;
  setStatus('idle', '');
}

export async function init(): Promise<void> {
  if (typeof window === 'undefined') return;
  userInfo = restoreUser();

  window.addEventListener('online', () => {
    if (signedIn) syncNow();
  });

  if (restoreToken()) {
    signedIn = true;
    setStatus('ok');
    try {
      await driveFetch('/about?fields=user');
      await fetchUserInfo();
      await syncNow();
      startBackgroundPull();
    } catch {
      accessToken = null;
      tokenExpiresAt = 0;
      signedIn = false;
      localStorage.removeItem(LS_TOKEN);
      setStatus('idle', 'Giriş gerekli');
    }
  } else {
    initTokenClient().catch(() => {});
  }
}
