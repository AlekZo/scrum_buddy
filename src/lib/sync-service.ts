import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { ScrumData, Entry } from "./types";
import { loadData, saveData } from "./storage";

// ─── Credentials ───
const CREDS_KEY = "supabase-credentials";

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
  // Emit current status immediately
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
  onDataMerged?: (data: ScrumData) => void
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
    // ─── PUSH: Projects ───
    const projectRows = localData.projects.map((name) => ({ name }));
    if (projectRows.length > 0) {
      const { error: projErr } = await sb
        .from("projects")
        .upsert(projectRows, { onConflict: "name" });
      if (projErr) throw projErr;
    }

    // ─── PUSH: Entries ───
    const entryRows: Array<{
      id: string;
      project_name: string;
      date: string;
      done: string;
      doing: string;
      blockers: string;
      hours: number;
      updated_at: string;
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
          updated_at: new Date().toISOString(),
        });
      }
    }

    if (entryRows.length > 0) {
      // Batch in chunks of 100
      for (let i = 0; i < entryRows.length; i += 100) {
        const chunk = entryRows.slice(i, i + 100);
        const { error: entErr } = await sb
          .from("entries")
          .upsert(chunk, { onConflict: "id" });
        if (entErr) throw entErr;
      }
    }

    // ─── PULL: Merge remote data into local ───
    const { data: remoteProjects, error: rpErr } = await sb
      .from("projects")
      .select("name");
    if (rpErr) throw rpErr;

    const { data: remoteEntries, error: reErr } = await sb
      .from("entries")
      .select("*");
    if (reErr) throw reErr;

    // Merge
    const merged = structuredClone(localData);

    // Add remote projects not in local
    for (const rp of remoteProjects || []) {
      if (!merged.projects.includes(rp.name)) {
        merged.projects.push(rp.name);
      }
    }

    // Add remote entries not in local
    for (const re of remoteEntries || []) {
      if (!merged.entries[re.project_name]) {
        merged.entries[re.project_name] = {};
      }
      // Only add if not already present locally (local is primary)
      if (!merged.entries[re.project_name][re.id]) {
        merged.entries[re.project_name][re.id] = {
          id: re.id,
          date: re.date,
          done: re.done || "",
          doing: re.doing || "",
          blockers: re.blockers || "",
          hours: Number(re.hours) || 0,
        };
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

  // Set initial status
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
