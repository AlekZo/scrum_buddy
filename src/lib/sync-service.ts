import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { ScrumData, Entry } from "./types";
import { loadData, saveData } from "./storage";

// ─── Credentials ───
const CREDS_KEY = "supabase-credentials";
const DELETED_KEY = "sync-deleted-ids"; // tombstone tracker

export interface SupabaseCredentials {
  url: string;
  anonKey: string;
}

export function getCredentials(): SupabaseCredentials | null {
  try {
    const raw = localStorage.getItem(CREDS_KEY);
    if (!raw) return null;
    const creds = JSON.parse(raw) as SupabaseCredentials;
    if (!creds.url || !creds.anonKey) return null;
    return creds;
  } catch {
    return null;
  }
}

export function saveCredentials(creds: SupabaseCredentials): void {
  localStorage.setItem(CREDS_KEY, JSON.stringify(creds));
}

export function clearCredentials(): void {
  localStorage.removeItem(CREDS_KEY);
}

// ─── Deletion tombstones ───
interface DeletedIds {
  entries: string[];
  projects: string[];
}

function getDeletedIds(): DeletedIds {
  try {
    const raw = localStorage.getItem(DELETED_KEY);
    if (!raw) return { entries: [], projects: [] };
    return JSON.parse(raw);
  } catch {
    return { entries: [], projects: [] };
  }
}

function saveDeletedIds(ids: DeletedIds): void {
  try {
    localStorage.setItem(DELETED_KEY, JSON.stringify(ids));
  } catch { /* best-effort */ }
}

export function trackDeletedEntry(entryId: string): void {
  const ids = getDeletedIds();
  if (!ids.entries.includes(entryId)) {
    ids.entries.push(entryId);
    saveDeletedIds(ids);
  }
}

export function trackDeletedProject(projectName: string): void {
  const ids = getDeletedIds();
  if (!ids.projects.includes(projectName)) {
    ids.projects.push(projectName);
    saveDeletedIds(ids);
  }
}

function clearDeletedIds(): void {
  saveDeletedIds({ entries: [], projects: [] });
}

// ─── Client singleton ───
let client: SupabaseClient | null = null;
let clientCredsKey: string | null = null;

export function getSupabaseClient(): SupabaseClient | null {
  const creds = getCredentials();
  if (!creds) {
    client = null;
    clientCredsKey = null;
    return null;
  }
  const key = `${creds.url}::${creds.anonKey}`;
  if (!client || clientCredsKey !== key) {
    client = createClient(creds.url, creds.anonKey);
    clientCredsKey = key;
  }
  return client;
}

export function resetClient(): void {
  client = null;
  clientCredsKey = null;
}

// ─── Sync status ───
export type SyncStatus = "offline" | "syncing" | "synced" | "error" | "unconfigured";

type SyncListener = (status: SyncStatus, message?: string) => void;
let syncListeners: SyncListener[] = [];
let currentSyncStatus: SyncStatus = "unconfigured";

export function onSyncStatus(listener: SyncListener): () => void {
  syncListeners.push(listener);
  listener(currentSyncStatus);
  return () => {
    syncListeners = syncListeners.filter((l) => l !== listener);
  };
}

function emitStatus(status: SyncStatus, message?: string) {
  currentSyncStatus = status;
  syncListeners.forEach((l) => l(status, message));
}

// ─── Sync engine ───
let syncInProgress = false;

export async function syncNow(
  localData: ScrumData,
  onDataMerged?: (data: ScrumData) => void,
  getLatestData?: () => ScrumData
): Promise<void> {
  if (syncInProgress) return;

  const sb = getSupabaseClient();
  if (!sb) {
    emitStatus("unconfigured");
    return;
  }

  if (!navigator.onLine) {
    emitStatus("offline");
    return;
  }

  syncInProgress = true;
  emitStatus("syncing");

  try {
    const deletedIds = getDeletedIds();

    // ─── PUSH: Soft-delete entries ───
    if (deletedIds.entries.length > 0) {
      for (let i = 0; i < deletedIds.entries.length; i += 100) {
        const chunk = deletedIds.entries.slice(i, i + 100);
        await sb
          .from("entries")
          .update({ is_deleted: true, updated_at: new Date().toISOString() })
          .in("id", chunk);
      }
    }

    // ─── PUSH: Soft-delete projects ───
    if (deletedIds.projects.length > 0) {
      for (const projName of deletedIds.projects) {
        await sb
          .from("projects")
          .update({ is_deleted: true })
          .eq("name", projName);
      }
    }

    // Clear tombstones after pushing
    clearDeletedIds();

    // ─── PUSH: Projects ───
    const projectRows = localData.projects.map((name) => ({ name, is_deleted: false }));
    if (projectRows.length > 0) {
      const { error: projErr } = await sb
        .from("projects")
        .upsert(projectRows, { onConflict: "name" });
      if (projErr) throw projErr;
    }

    // ─── PUSH: Entries ───
    const now = new Date().toISOString();
    const entryRows: Array<{
      id: string;
      project_name: string;
      date: string;
      done: string;
      doing: string;
      blockers: string;
      hours: number;
      version: string;
      updated_at: string;
      is_deleted: boolean;
    }> = [];

    for (const project of localData.projects) {
      const projectEntries = localData.entries[project];
      if (!projectEntries) continue;
      for (const entry of Object.values(projectEntries)) {
        entryRows.push({
          id: entry.id,
          project_name: project,
          date: entry.date,
          done: entry.done,
          doing: entry.doing,
          blockers: entry.blockers,
          hours: entry.hours,
          version: entry.version || "",
          updated_at: now,
          is_deleted: false,
        });
      }
    }

    if (entryRows.length > 0) {
      for (let i = 0; i < entryRows.length; i += 100) {
        const chunk = entryRows.slice(i, i + 100);
        const { error: entErr } = await sb
          .from("entries")
          .upsert(chunk, { onConflict: "id" });
        if (entErr) throw entErr;
      }
    }

    // ─── PULL: Merge remote data into local (with conflict resolution) ───
    const { data: remoteProjects, error: rpErr } = await sb
      .from("projects")
      .select("name, is_deleted")
      .eq("is_deleted", false);
    if (rpErr) throw rpErr;

    const { data: remoteEntries, error: reErr } = await sb
      .from("entries")
      .select("*")
      .eq("is_deleted", false);
    if (reErr) throw reErr;

    // Use LATEST local data at merge time
    const latestLocal = getLatestData ? getLatestData() : localData;
    const merged = structuredClone(latestLocal);

    // Add remote projects not in local
    for (const rp of remoteProjects || []) {
      if (!merged.projects.includes(rp.name)) {
        merged.projects.push(rp.name);
      }
    }

    // Merge remote entries with timestamp-based conflict resolution
    for (const re of remoteEntries || []) {
      if (!merged.entries[re.project_name]) {
        merged.entries[re.project_name] = {};
      }

      const localEntry = merged.entries[re.project_name][re.id];

      if (!localEntry) {
        // Remote-only: add it
        merged.entries[re.project_name][re.id] = {
          id: re.id,
          date: re.date,
          done: re.done || "",
          doing: re.doing || "",
          blockers: re.blockers || "",
          hours: Number(re.hours) || 0,
          version: re.version || "",
        };
      } else if (re.updated_at) {
        // Both exist: keep the newer one based on updated_at
        // Local entries pushed this sync have `now` as updated_at,
        // so remote wins only if its timestamp is strictly newer
        const remoteTime = new Date(re.updated_at).getTime();
        const pushTime = new Date(now).getTime();

        if (remoteTime > pushTime) {
          // Remote is newer (edited on another device after our push)
          merged.entries[re.project_name][re.id] = {
            id: re.id,
            date: re.date,
            done: re.done || "",
            doing: re.doing || "",
            blockers: re.blockers || "",
            hours: Number(re.hours) || 0,
            version: re.version || "",
          };
        }
        // Otherwise local wins (same or newer)
      }
    }

    // Persist merged data
    saveData(merged);
    onDataMerged?.(merged);

    emitStatus("synced");
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[sync] Error:", message);
    emitStatus("error", message);
  } finally {
    syncInProgress = false;
  }
}

// ─── Network listeners ───
let networkListenersAttached = false;
let pendingCallback: ((data: ScrumData) => void) | null = null;

export function initNetworkListeners(
  getLocalData: () => ScrumData,
  onDataMerged: (data: ScrumData) => void
): () => void {
  if (networkListenersAttached) return () => {};

  pendingCallback = onDataMerged;

  const handleOnline = () => {
    const data = getLocalData();
    syncNow(data, pendingCallback || undefined);
  };

  const handleOffline = () => {
    emitStatus("offline");
  };

  window.addEventListener("online", handleOnline);
  window.addEventListener("offline", handleOffline);
  networkListenersAttached = true;

  if (!navigator.onLine) {
    emitStatus("offline");
  } else if (!getCredentials()) {
    emitStatus("unconfigured");
  }

  return () => {
    window.removeEventListener("online", handleOnline);
    window.removeEventListener("offline", handleOffline);
    networkListenersAttached = false;
  };
}
