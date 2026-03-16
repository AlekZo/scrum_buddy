import { formatDate } from "./types";

export interface Promise {
  id: string;
  text: string;
  deadline: string; // YYYY-MM-DD
  createdAt: string; // YYYY-MM-DD
  completed?: boolean;
  project?: string;
}

export interface PromiseData {
  promises: Promise[];
}

const STORAGE_KEY = "scrum-promises";

export function loadPromises(): PromiseData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { promises: [] };
    return JSON.parse(raw) as PromiseData;
  } catch {
    return { promises: [] };
  }
}

export function savePromises(data: PromiseData): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

/** Get promises with deadline on a specific date */
export function getPromisesForDate(data: PromiseData, date: string): Promise[] {
  return data.promises.filter((p) => p.deadline === date && !p.completed);
}

/** Get all active (non-completed) promises */
export function getActivePromises(data: PromiseData): Promise[] {
  return data.promises.filter((p) => !p.completed);
}

// ── NLP Date Parser ──

const DAY_NAMES_EN = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const DAY_NAMES_RU = ["воскресенье", "понедельник", "вторник", "среда", "четверг", "пятница", "суббота"];
const DAY_SHORT_RU = ["вс", "пн", "вт", "ср", "чт", "пт", "сб"];
const MONTH_NAMES = ["january","february","march","april","may","june","july","august","september","october","november","december"];

function nextDayOfWeek(targetDay: number): Date {
  const today = new Date();
  const current = today.getDay();
  let diff = targetDay - current;
  if (diff <= 0) diff += 7;
  const d = new Date(today);
  d.setDate(d.getDate() + diff);
  return d;
}

/**
 * Parse a natural language deadline from text.
 * Returns a YYYY-MM-DD string or null if no date found.
 */
export function parseDeadline(text: string): string | null {
  const lower = text.toLowerCase().trim();
  const today = new Date();

  // "today" / "сегодня"
  if (/\btoday\b|\bсегодня\b/.test(lower)) return formatDate(today);

  // "tomorrow" / "завтра"
  if (/\btomorrow\b|\bзавтра\b/.test(lower)) {
    const d = new Date(today);
    d.setDate(d.getDate() + 1);
    return formatDate(d);
  }

  // "in X days" / "через X дней/дня"
  const inDays = lower.match(/(?:\bin\s+(\d+)\s+days?\b|\bчерез\s+(\d+)\s+(?:дн|день))/);
  if (inDays) {
    const n = parseInt(inDays[1] || inDays[2]);
    const d = new Date(today);
    d.setDate(d.getDate() + n);
    return formatDate(d);
  }

  // "by friday", "next monday", "this wednesday"
  for (let i = 0; i < DAY_NAMES_EN.length; i++) {
    const re = new RegExp(`(?:by|next|this|on)\\s+${DAY_NAMES_EN[i]}`, "i");
    if (re.test(lower)) return formatDate(nextDayOfWeek(i));
  }
  // Just day name at end: "review by friday" → check if text ends with day name
  for (let i = 0; i < DAY_NAMES_EN.length; i++) {
    if (lower.endsWith(DAY_NAMES_EN[i])) return formatDate(nextDayOfWeek(i));
  }

  // Russian day names
  for (let i = 0; i < DAY_NAMES_RU.length; i++) {
    if (lower.includes(DAY_NAMES_RU[i]) || lower.includes(DAY_SHORT_RU[i])) {
      return formatDate(nextDayOfWeek(i));
    }
  }

  // "end of week" / "конец недели" → this Friday
  if (/end\s+of\s+week|\bконец\s+недели\b|\beow\b/.test(lower)) {
    return formatDate(nextDayOfWeek(5)); // Friday
  }

  // "next week" / "следующая неделя" → next Monday
  if (/\bnext\s+week\b|\bследующ\w*\s+недел/.test(lower)) {
    return formatDate(nextDayOfWeek(1)); // Monday
  }

  // ISO date: 2024-03-15
  const iso = text.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  if (iso) return iso[1];

  // "March 15" or "15 March"
  for (let m = 0; m < MONTH_NAMES.length; m++) {
    const re1 = new RegExp(`${MONTH_NAMES[m]}\\s+(\\d{1,2})`, "i");
    const re2 = new RegExp(`(\\d{1,2})\\s+${MONTH_NAMES[m]}`, "i");
    const match = lower.match(re1) || lower.match(re2);
    if (match) {
      const day = parseInt(match[1]);
      const d = new Date(today.getFullYear(), m, day);
      if (d < today) d.setFullYear(d.getFullYear() + 1);
      return formatDate(d);
    }
  }

  // DD.MM or DD/MM
  const dmMatch = text.match(/\b(\d{1,2})[./](\d{1,2})\b/);
  if (dmMatch) {
    const day = parseInt(dmMatch[1]);
    const month = parseInt(dmMatch[2]) - 1;
    if (month >= 0 && month <= 11 && day >= 1 && day <= 31) {
      const d = new Date(today.getFullYear(), month, day);
      if (d < today) d.setFullYear(d.getFullYear() + 1);
      return formatDate(d);
    }
  }

  return null;
}

function generateId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export function createPromise(text: string, deadline: string, project?: string): Promise {
  return {
    id: generateId(),
    text,
    deadline,
    createdAt: formatDate(new Date()),
    project,
  };
}
