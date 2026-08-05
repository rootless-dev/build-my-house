/**
 * The project library — Build my House's "disk".
 *
 * It lives in the origin's IndexedDB: in the browser profile, on the user's
 * machine, surviving both the tab and the browser being closed. Chosen over
 * localStorage because we store structured objects and image blobs (the
 * thumbnails), with a quota in the hundreds of MB rather than localStorage's
 * ~5 MB of text — and without blocking the main thread on every write.
 *
 * Metadata is kept apart from the snapshots: the menu lists dozens of projects
 * by reading only the light store, and the heavy model is fetched only when a
 * project is actually opened.
 */

import type { ModelSnapshot } from '../core/types';
import { openDB, req, txDone } from './idb';

const DB_NAME = 'build-my-house';
const DB_VERSION = 1;
const META = 'projects';
const SNAPS = 'snapshots';

export type LibraryScope = 'active' | 'trashed' | 'all';

export interface ProjectStats {
  vertices: number;
  edges: number;
  faces: number;
  /** Total face area, in m². */
  area: number;
}

export interface ProjectMeta {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  /** When it went to the trash, or null while it is active. */
  trashedAt: number | null;
  thumb: Blob | null;
  stats: ProjectStats;
}

let dbPromise: Promise<IDBDatabase> | null = null;

export function openLibrary(): Promise<IDBDatabase> {
  dbPromise ??= openDB(DB_NAME, DB_VERSION, (db) => {
    if (!db.objectStoreNames.contains(META)) {
      const store = db.createObjectStore(META, { keyPath: 'id' });
      store.createIndex('by-updated', 'updatedAt');
    }
    if (!db.objectStoreNames.contains(SNAPS)) {
      db.createObjectStore(SNAPS, { keyPath: 'id' });
    }
  });
  return dbPromise;
}

function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `p_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

/** Lists the projects, newest first. */
export async function listProjects(scope: LibraryScope = 'active'): Promise<ProjectMeta[]> {
  const db = await openLibrary();
  const tx = db.transaction(META, 'readonly');
  const all = await req<ProjectMeta[]>(tx.objectStore(META).getAll());
  await txDone(tx);
  const filtered = all.filter((p) =>
    scope === 'all' ? true : scope === 'trashed' ? p.trashedAt !== null : p.trashedAt === null,
  );
  return filtered.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function readProject(id: string): Promise<{ meta: ProjectMeta; snapshot: ModelSnapshot } | null> {
  const db = await openLibrary();
  const tx = db.transaction([META, SNAPS], 'readonly');
  const meta = await req<ProjectMeta | undefined>(tx.objectStore(META).get(id));
  const row = await req<{ id: string; snapshot: ModelSnapshot } | undefined>(tx.objectStore(SNAPS).get(id));
  await txDone(tx);
  if (!meta || !row) return null;
  return { meta, snapshot: row.snapshot };
}

export interface WriteInput {
  id?: string;
  name: string;
  snapshot: ModelSnapshot;
  stats: ProjectStats;
  /** `undefined` keeps whatever thumbnail was already stored. */
  thumb?: Blob | null;
}

/** Creates or updates a project. Returns the metadata as written. */
export async function writeProject(input: WriteInput): Promise<ProjectMeta> {
  const db = await openLibrary();
  const now = Date.now();
  const tx = db.transaction([META, SNAPS], 'readwrite');
  const metaStore = tx.objectStore(META);
  const id = input.id ?? newId();
  const previous = input.id ? await req<ProjectMeta | undefined>(metaStore.get(id)) : undefined;

  const meta: ProjectMeta = {
    id,
    name: input.name,
    createdAt: previous?.createdAt ?? now,
    updatedAt: now,
    trashedAt: previous?.trashedAt ?? null,
    thumb: input.thumb === undefined ? (previous?.thumb ?? null) : input.thumb,
    stats: input.stats,
  };

  await req(metaStore.put(meta));
  await req(tx.objectStore(SNAPS).put({ id, snapshot: input.snapshot }));
  await txDone(tx);
  return meta;
}

export async function renameProject(id: string, name: string): Promise<void> {
  const db = await openLibrary();
  const tx = db.transaction(META, 'readwrite');
  const store = tx.objectStore(META);
  const meta = await req<ProjectMeta | undefined>(store.get(id));
  if (meta) await req(store.put({ ...meta, name, updatedAt: Date.now() }));
  await txDone(tx);
}

export async function duplicateProject(id: string): Promise<ProjectMeta | null> {
  const found = await readProject(id);
  if (!found) return null;
  return writeProject({
    name: `${found.meta.name} (cópia)`,
    snapshot: found.snapshot,
    stats: found.meta.stats,
    thumb: found.meta.thumb,
  });
}

async function setTrashed(id: string, trashedAt: number | null): Promise<void> {
  const db = await openLibrary();
  const tx = db.transaction(META, 'readwrite');
  const store = tx.objectStore(META);
  const meta = await req<ProjectMeta | undefined>(store.get(id));
  if (meta) await req(store.put({ ...meta, trashedAt }));
  await txDone(tx);
}

export const trashProject = (id: string) => setTrashed(id, Date.now());
export const restoreProject = (id: string) => setTrashed(id, null);

export async function deleteProject(id: string): Promise<void> {
  const db = await openLibrary();
  const tx = db.transaction([META, SNAPS], 'readwrite');
  await req(tx.objectStore(META).delete(id));
  await req(tx.objectStore(SNAPS).delete(id));
  await txDone(tx);
}

export async function emptyTrash(): Promise<number> {
  const trashed = await listProjects('trashed');
  for (const p of trashed) await deleteProject(p.id);
  return trashed.length;
}

export interface StorageInfo {
  usage: number;
  quota: number;
  /** True once the browser has promised not to evict this data on its own. */
  persisted: boolean;
}

/**
 * Asks for persistent storage. Without it the browser may clear IndexedDB when
 * disk gets tight; with it, projects only disappear when the user says so. Some
 * browsers grant it silently, others only after the site is bookmarked or given
 * permission — hence returning the outcome.
 */
export async function requestPersistence(): Promise<boolean> {
  if (!navigator.storage?.persist) return false;
  try {
    if (await navigator.storage.persisted?.()) return true;
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}

export async function storageInfo(): Promise<StorageInfo> {
  const persisted = (await navigator.storage?.persisted?.()) ?? false;
  const estimate = (await navigator.storage?.estimate?.()) ?? {};
  return { usage: estimate.usage ?? 0, quota: estimate.quota ?? 0, persisted };
}
