import { ScrumData } from "./types";

const STORAGE_KEY = "daily-scrum-logger";
const MAX_ENTRIES_PER_PROJECT = 180; // ~6 months of daily entries

const defaultData: ScrumData = {
  projects: ["Project Alpha", "Project Beta"],
  entries: {},
};

// ── File API detection ─────────────────────────────────

let _fileApiAvailable: boolean | null = null;

async function isFileApiAvailable(): Promise<boolean> {
  if (_fileApiAvailable !== null) return _fileApiAvailable;
  try {
    const res = await fetch("/api/health", { method: "GET", signal: AbortSignal.timeout(2000) });
    _fileApiAvailable = res.ok;
  } catch {
    _fileApiAvailable = false;
  }
  return _fileApiAvailable;
}

// Eagerly probe on load (non-blocking)
isFileApiAvailable();

// ── File API helpers ───────────────────────────────────

async function fileLoad(): Promise<ScrumData | null> {
  const res = await fetch("/api/data");
  if (!res.ok) return null;
  return await res.json();
}

async function fileSave(data: ScrumData): Promise<boolean> {
  const res = await fetch("/api/data", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return res.ok;
}

// ── Pruning ────────────────────────────────────────────

function pruneEntries(data: ScrumData, limit = MAX_ENTRIES_PER_PROJECT): ScrumData {
  const pruned = structuredClone(data);
  for (const project of pruned.projects) {
    const entries = pruned.entries[project];
    if (!entries) continue;
    const sorted = Object.values(entries).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    if (sorted.length > limit) {
      const kept: Record<string, typeof sorted[0]> = {};
      for (const entry of sorted.slice(0, limit)) {
        kept[entry.id] = entry;
      }
      pruned.entries[project] = kept;
    }
  }
  return pruned;
}

// ── Public API (sync — localStorage always, async file API on top) ──

export function loadData(): ScrumData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return structuredClone(defaultData);
    return JSON.parse(raw) as ScrumData;
  } catch {
    return structuredClone(defaultData);
  }
}

export function saveData(data: ScrumData): void {
  try {
    const toSave = pruneEntries(data);
    const prunedCount = Object.keys(data.entries).reduce((sum, proj) => {
      const before = Object.keys(data.entries[proj] || {}).length;
      const after = Object.keys(toSave.entries[proj] || {}).length;
      return sum + (before - after);
    }, 0);
    if (prunedCount > 0) {
      console.warn(`[storage] Pruned ${prunedCount} old entries. Enable Supabase sync to preserve history.`);
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));

    // Also persist to file API if available (fire-and-forget)
    if (_fileApiAvailable) {
      fileSave(toSave).catch((err) =>
        console.warn("[storage] File API save failed:", err)
      );
    }
  } catch (err) {
    console.error("[storage] Failed to save data:", err);
    if (err instanceof DOMException && err.name === "QuotaExceededError") {
      try {
        const aggressive = pruneEntries(data, 90);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(aggressive));
        if (_fileApiAvailable) fileSave(aggressive).catch(() => {});
        console.warn("[storage] Saved with aggressive pruning due to quota");
      } catch {
        console.error("[storage] Failed even with aggressive pruning");
      }
    }
  }
}

/**
 * Initialize storage: if file API is available and has data but localStorage
 * is empty, seed localStorage from the volume. If localStorage has data but
 * file API doesn't, seed the volume. Called once on app startup.
 */
export async function initStorage(): Promise<void> {
  const available = await isFileApiAvailable();
  if (!available) return;

  const localRaw = localStorage.getItem(STORAGE_KEY);
  const localData = localRaw ? (JSON.parse(localRaw) as ScrumData) : null;
  const localHasData = localData && Object.keys(localData.entries).some(
    (p) => Object.keys(localData.entries[p] || {}).length > 0
  );

  try {
    const fileData = await fileLoad();
    const fileHasData = fileData && Object.keys(fileData.entries || {}).some(
      (p) => Object.keys(fileData.entries[p] || {}).length > 0
    );

    if (fileHasData && !localHasData) {
      // Volume has data, localStorage doesn't → restore from volume
      localStorage.setItem(STORAGE_KEY, JSON.stringify(fileData));
      console.info("[storage] Restored data from volume");
    } else if (localHasData && !fileHasData) {
      // localStorage has data, volume doesn't → seed volume
      await fileSave(localData!);
      console.info("[storage] Seeded volume from localStorage");
    } else if (localHasData && fileHasData) {
      // Both have data → merge: keep most recent per entry
      // For simplicity, push localStorage to file (it's the primary source)
      await fileSave(localData!);
      console.info("[storage] Synced localStorage → volume");
    }
  } catch (err) {
    console.warn("[storage] Volume init failed:", err);
  }
}

/**
 * Check if file-based storage (Docker volume) is active
 */
export function isVolumeStorageActive(): boolean {
  return _fileApiAvailable === true;
}

export function getStorageUsage(): { used: number; limit: number; percentage: number } {
  try {
    let total = 0;
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key) {
        total += localStorage.getItem(key)?.length || 0;
      }
    }
    const limit = 5 * 1024 * 1024; // ~5MB typical limit
    return { used: total * 2, limit, percentage: (total * 2 / limit) * 100 }; // *2 for UTF-16
  } catch {
    return { used: 0, limit: 5242880, percentage: 0 };
  }
}
