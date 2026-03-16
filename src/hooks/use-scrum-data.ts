import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { ScrumData, Entry, createEmptyEntry, getToday } from "@/lib/types";
import { loadData, saveData } from "@/lib/storage";
import { syncNow, initNetworkListeners, getCredentials, trackDeletedEntry, trackDeletedProject } from "@/lib/sync-service";

export function useScrumData() {
  const [data, setData] = useState<ScrumData>(loadData);
  const [activeProject, setActiveProject] = useState<string>("");
  const [selectedDate, setSelectedDate] = useState<string>(getToday());
  const dataRef = useRef(data);
  dataRef.current = data;

  // Track whether a change came from sync (to avoid re-triggering sync)
  const fromSyncRef = useRef(false);

  useEffect(() => {
    if (!activeProject && data.projects.length > 0) {
      setActiveProject(data.projects[0]);
    }
  }, [data.projects, activeProject]);

  // Persist to localStorage on every change
  useEffect(() => {
    try {
      saveData(data);
    } catch (err) {
      console.error("[storage] Failed to save:", err);
    }
  }, [data]);

  // Debounced sync after USER-initiated data changes (not sync-initiated)
  const syncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (fromSyncRef.current) {
      fromSyncRef.current = false;
      return; // Skip sync trigger for sync-originated updates
    }
    if (!getCredentials()) return;
    if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
    syncTimerRef.current = setTimeout(() => {
      syncNow(dataRef.current, (merged) => {
        if (JSON.stringify(dataRef.current) !== JSON.stringify(merged)) {
          fromSyncRef.current = true;
          setData(merged);
        }
      }, () => dataRef.current);
    }, 3000);
    return () => {
      if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
    };
  }, [data]);

  // Network listeners for auto-sync on reconnect
  useEffect(() => {
    const cleanup = initNetworkListeners(
      () => dataRef.current,
      (merged) => {
        if (JSON.stringify(dataRef.current) !== JSON.stringify(merged)) {
          fromSyncRef.current = true;
          setData(merged);
        }
      }
    );
    return cleanup;
  }, []);

  // Cross-tab sync via storage event
  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key === "daily-scrum-logger" && e.newValue) {
        try {
          const newData = JSON.parse(e.newValue) as ScrumData;
          fromSyncRef.current = true;
          setData(newData);
        } catch { /* ignore parse errors */ }
      }
    };
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  // Initial sync on mount
  useEffect(() => {
    if (getCredentials() && navigator.onLine) {
      syncNow(dataRef.current, (merged) => {
        if (JSON.stringify(dataRef.current) !== JSON.stringify(merged)) {
          fromSyncRef.current = true;
          setData(merged);
        }
      }, () => dataRef.current);
    }
  }, []);

  const triggerSync = useCallback(() => {
    syncNow(dataRef.current, (merged) => {
      if (JSON.stringify(dataRef.current) !== JSON.stringify(merged)) {
        fromSyncRef.current = true;
        setData(merged);
      }
    }, () => dataRef.current);
  }, []);

  const getEntry = useCallback(
    (project: string, date: string): Entry | null => {
      const projectEntries = data.entries[project];
      if (!projectEntries) return null;
      return Object.values(projectEntries).find((e) => e.date === date) || null;
    },
    [data.entries]
  );

  const saveEntry = useCallback(
    (project: string, entry: Entry) => {
      setData((prev) => ({
        ...prev,
        entries: {
          ...prev.entries,
          [project]: {
            ...(prev.entries[project] || {}),
            [entry.id]: entry,
          },
        },
      }));
    },
    []
  );

  const addProject = useCallback((name: string) => {
    setData((prev) => {
      if (prev.projects.some((p) => p.toLowerCase() === name.toLowerCase())) {
        return prev; // Duplicate — no-op
      }
      return { ...prev, projects: [...prev.projects, name] };
    });
  }, []);

  const removeProject = useCallback((name: string) => {
    setData((prev) => {
      const removedEntries = prev.entries[name];
      if (removedEntries) {
        Object.keys(removedEntries).forEach((id) => trackDeletedEntry(id));
      }
      trackDeletedProject(name);

      const { [name]: _, ...rest } = prev.entries;
      const newProjects = prev.projects.filter((p) => p !== name);
      return {
        ...prev,
        projects: newProjects,
        entries: rest,
      };
    });
    // Reset activeProject if it was the deleted one
    setActiveProject((current) => {
      if (current !== name) return current;
      return "";
    });
  }, []);

  const renameProject = useCallback((oldName: string, newName: string) => {
    setData((prev) => {
      // Prevent renaming to an existing project name (case-insensitive)
      if (prev.projects.some((p) => p !== oldName && p.toLowerCase() === newName.toLowerCase())) {
        return prev; // Collision — no-op
      }
      const { [oldName]: projectEntries, ...restEntries } = prev.entries;
      return {
        ...prev,
        projects: prev.projects.map((p) => (p === oldName ? newName : p)),
        entries: {
          ...restEntries,
          ...(projectEntries ? { [newName]: projectEntries } : {}),
        },
      };
    });
    setActiveProject((current) => (current === oldName ? newName : current));
  }, []);

  // Memoize sorted entries per project to prevent unnecessary re-allocations
  const entriesCache = useMemo(() => {
    const cache: Record<string, Entry[]> = {};
    for (const project of data.projects) {
      const projectEntries = data.entries[project];
      if (!projectEntries) { cache[project] = []; continue; }
      cache[project] = Object.values(projectEntries).sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
      );
    }
    return cache;
  }, [data.entries, data.projects]);

  const getEntriesForProject = useCallback(
    (project: string): Entry[] => {
      return entriesCache[project] || [];
    },
    [entriesCache]
  );

  const importData = useCallback((newData: ScrumData) => {
    setData(newData);
    if (newData.projects.length > 0) setActiveProject(newData.projects[0]);
  }, []);

  /**
   * Update version on all entries across projects that share task text with the given entry.
   * Looks for entries with similar "done" or "doing" content and sets their version.
   */
  const updateDuplicateVersions = useCallback(
    (sourceEntry: Entry, version: string) => {
      const sourceLines = new Set(
        [...sourceEntry.done.split("\n"), ...sourceEntry.doing.split("\n")]
          .map((l) => l.trim().replace(/^[-•*]\s*/, "").toLowerCase())
          .filter(Boolean)
      );
      if (sourceLines.size === 0) return 0;

      let count = 0;
      setData((prev) => {
        // Targeted update: only clone entries that actually change
        const nextEntries = { ...prev.entries };
        let changed = false;
        for (const proj of prev.projects) {
          const entries = prev.entries[proj];
          if (!entries) continue;
          let projChanged = false;
          const projEntries = { ...entries };
          for (const [id, entry] of Object.entries(projEntries)) {
            if (id === sourceEntry.id) continue;
            const entryLines = [...entry.done.split("\n"), ...entry.doing.split("\n")]
              .map((l) => l.trim().replace(/^[-•*]\s*/, "").toLowerCase())
              .filter(Boolean);
            const overlap = entryLines.filter((l) => sourceLines.has(l)).length;
            if (overlap > 0 && overlap >= entryLines.length * 0.5) {
              projEntries[id] = { ...entry, version };
              projChanged = true;
              count++;
            }
          }
          if (projChanged) {
            nextEntries[proj] = projEntries;
            changed = true;
          }
        }
        return changed ? { ...prev, entries: nextEntries } : prev;
      });
      return count;
    },
    []
  );

  const currentEntry = getEntry(activeProject, selectedDate);

  return {
    data,
    activeProject,
    setActiveProject,
    selectedDate,
    setSelectedDate,
    currentEntry,
    getEntry,
    saveEntry,
    addProject,
    importData,
    removeProject,
    renameProject,
    getEntriesForProject,
    createEmptyEntry,
    triggerSync,
    updateDuplicateVersions,
  };
}
