import { useState, useCallback, useEffect } from "react";
import { ScrumData, Entry, createEmptyEntry, getToday } from "@/lib/types";
import { loadData, saveData } from "@/lib/storage";

export function useScrumData() {
  const [data, setData] = useState<ScrumData>(loadData);
  const [activeProject, setActiveProject] = useState<string>("");
  const [selectedDate, setSelectedDate] = useState<string>(getToday());

  useEffect(() => {
    if (!activeProject && data.projects.length > 0) {
      setActiveProject(data.projects[0]);
    }
  }, [data.projects, activeProject]);

  useEffect(() => {
    saveData(data);
  }, [data]);

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
  };
}
