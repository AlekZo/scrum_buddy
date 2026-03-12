import { ScrumData } from "./types";

const STORAGE_KEY = "daily-scrum-logger";

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

export function saveData(data: ScrumData): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}
