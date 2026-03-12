export interface Entry {
  id: string;
  date: string;
  done: string;
  doing: string;
  blockers: string;
  hours: number; // auto-computed from parsed tasks
}

export interface ParsedTask {
  text: string;
  hours: number;
  source: "done" | "doing";
  tags: string[];
}

export interface ScrumData {
  projects: string[];
  entries: Record<string, Record<string, Entry>>;
}

export const createEmptyEntry = (date: string): Entry => ({
  id: crypto.randomUUID(),
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
