import { useState, useCallback, useEffect, useRef } from "react";
import { ScrumData, Entry, createEmptyEntry, getToday } from "@/lib/types";
import { loadData, saveData } from "@/lib/storage";
import { syncNow, initNetworkListeners, getCredentials } from "@/lib/sync-service";

export function useScrumData() {
  const [data, setData] = useState<ScrumData>(loadData);
  const [activeProject, setActiveProject] = useState<string>("");
  const [selectedDate, setSelectedDate] = useState<string>(getToday());
  const dataRef = useRef(data);
  dataRef.current = data;

  useEffect(() => {
    if (!activeProject && data.projects.length > 0) {
      setActiveProject(data.projects[0]);
    }
  }, [data.projects, activeProject]);

  // Persist to localStorage on every change
  useEffect(() => {
    saveData(data);
  }, [data]);

  // Debounced sync after data changes
  const syncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!getCredentials()) return;
    if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
    syncTimerRef.current = setTimeout(() => {
      syncNow(dataRef.current, (merged) => {
        setData(merged);
      });
    }, 3000);
    return () => {
      if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
    };
  }, [data]);

  // Network listeners for auto-sync on reconnect
  useEffect(() => {
    const cleanup = initNetworkListeners(
      () => dataRef.current,
      (merged) => setData(merged)
    );
    return cleanup;
  }, []);

  // Initial sync on mount
  useEffect(() => {
    if (getCredentials() && navigator.onLine) {
      syncNow(dataRef.current, (merged) => setData(merged));
    }
  }, []);

  const triggerSync = useCallback(() => {
    syncNow(dataRef.current, (merged) => setData(merged));
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
    setData((prev) => ({
      ...prev,
      projects: [...prev.projects, name],
    }));
  }, []);

  const removeProject = useCallback((name: string) => {
    setData((prev) => {
      const { [name]: _, ...rest } = prev.entries;
      return {
        ...prev,
        projects: prev.projects.filter((p) => p !== name),
        entries: rest,
      };
    });
  }, []);

  const renameProject = useCallback((oldName: string, newName: string) => {
    setData((prev) => {
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
    if (activeProject === oldName) setActiveProject(newName);
  }, [activeProject]);

  const getEntriesForProject = useCallback(
    (project: string): Entry[] => {
      const projectEntries = data.entries[project];
      if (!projectEntries) return [];
      return Object.values(projectEntries).sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
      );
    },
    [data.entries]
  );

  const importData = useCallback((newData: ScrumData) => {
    setData(newData);
    if (newData.projects.length > 0) setActiveProject(newData.projects[0]);
  }, []);

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
  };
}
