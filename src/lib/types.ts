export interface Entry {
  id: string;
  date: string;
  done: string;
  doing: string;
  blockers: string;
  hours: number; // auto-computed from parsed tasks (backward compat, = actualHours)
  /** Cached actual hours (computed on save) */
  actualHours?: number;
  /** Cached team hours (computed on save) */
  teamHours?: number;
  /** Count of done tasks (cached on save) */
  doneTaskCount?: number;
  /** Count of doing tasks (cached on save) */
  doingTaskCount?: number;
  version?: string; // user-defined version label (e.g. "v2", "sprint-3")
  reported?: boolean; // whether this entry has been reported to team (freezes fields)
}

export interface ParsedTask {
  text: string;
  hours: number; // backward compat: equals actualHours when dual, otherwise the single value
  /** Actual time spent (your real hours) */
  actualHours: number;
  /** Time communicated to team/stakeholders (padded estimate) */
  teamHours: number;
  source: "done" | "doing";
  tags: string[];
}

export interface ScrumData {
  projects: string[];
  entries: Record<string, Record<string, Entry>>;
}

/** Generate a UUID, with fallback for non-secure contexts (HTTP) */
function generateId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  // Fallback: pseudo-random UUID v4
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export const createEmptyEntry = (date: string): Entry => ({
  id: generateId(),
  date,
  done: "",
  doing: "",
  blockers: "",
  hours: 0,
});

export const formatDate = (date: Date): string => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};

export const getToday = (): string => formatDate(new Date());

export const getYesterdayDate = (date: string): string => {
  const d = new Date(date);
  d.setDate(d.getDate() - 1);
  return formatDate(d);
};
