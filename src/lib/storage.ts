import { ScrumData } from "./types";

const STORAGE_KEY = "daily-scrum-logger";
const MAX_ENTRIES_PER_PROJECT = 180; // ~6 months of daily entries

const defaultData: ScrumData = {
  projects: ["Project Alpha", "Project Beta"],
  entries: {},
};

export function loadData(): ScrumData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return structuredClone(defaultData);
    return JSON.parse(raw) as ScrumData;
  } catch {
    return structuredClone(defaultData);
  }
}

/**
 * Prune old entries to prevent localStorage from growing indefinitely.
 * Keeps the most recent MAX_ENTRIES_PER_PROJECT entries per project.
 */
function pruneEntries(data: ScrumData): ScrumData {
  const pruned = structuredClone(data);
  for (const project of pruned.projects) {
    const entries = pruned.entries[project];
    if (!entries) continue;
    const sorted = Object.values(entries).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    if (sorted.length > MAX_ENTRIES_PER_PROJECT) {
      const kept: Record<string, typeof sorted[0]> = {};
      for (const entry of sorted.slice(0, MAX_ENTRIES_PER_PROJECT)) {
        kept[entry.id] = entry;
      }
      pruned.entries[project] = kept;
    }
  }
  return pruned;
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
  } catch (err) {
    console.error("[storage] Failed to save data:", err);
    // If quota exceeded, try aggressive prune
    if (err instanceof DOMException && err.name === "QuotaExceededError") {
      try {
        const aggressive = pruneEntries(data);
        // Further reduce to 90 entries per project
        for (const project of aggressive.projects) {
          const entries = aggressive.entries[project];
          if (!entries) continue;
          const sorted = Object.values(entries).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
          if (sorted.length > 90) {
            const kept: Record<string, typeof sorted[0]> = {};
            for (const entry of sorted.slice(0, 90)) {
              kept[entry.id] = entry;
            }
            aggressive.entries[project] = kept;
          }
        }
        localStorage.setItem(STORAGE_KEY, JSON.stringify(aggressive));
        console.warn("[storage] Saved with aggressive pruning due to quota");
      } catch {
        console.error("[storage] Failed even with aggressive pruning");
      }
    }
  }
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
