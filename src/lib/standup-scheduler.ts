/**
 * Client-side standup scheduler
 * Checks project standup times and auto-sends to Telegram 5 minutes before.
 */

import { isTelegramConfigured, sendTelegramMessage } from "./telegram-service";

const SCHEDULE_KEY = "standup-schedule";
const SENT_LOG_KEY = "standup-sent-log";

export interface StandupSchedule {
  /** Map of project name → "HH:MM" (24h format) */
  times: Record<string, string>;
}

export function getStandupSchedule(): StandupSchedule {
  try {
    const raw = localStorage.getItem(SCHEDULE_KEY);
    if (!raw) return { times: {} };
    return JSON.parse(raw);
  } catch {
    return { times: {} };
  }
}

export function saveStandupSchedule(schedule: StandupSchedule): void {
  localStorage.setItem(SCHEDULE_KEY, JSON.stringify(schedule));
}

export function setProjectStandupTime(project: string, time: string): void {
  const schedule = getStandupSchedule();
  if (time) {
    schedule.times[project] = time;
  } else {
    delete schedule.times[project];
  }
  saveStandupSchedule(schedule);
}

export function getProjectStandupTime(project: string): string {
  return getStandupSchedule().times[project] || "";
}

/** Track which project+date combos have already been sent */
function getSentLog(): Set<string> {
  try {
    const raw = localStorage.getItem(SENT_LOG_KEY);
    if (!raw) return new Set();
    return new Set(JSON.parse(raw));
  } catch {
    return new Set();
  }
}

function markSent(key: string): void {
  const log = getSentLog();
  log.add(key);
  // Keep only last 100 entries
  const arr = Array.from(log).slice(-100);
  localStorage.setItem(SENT_LOG_KEY, JSON.stringify(arr));
}

function wasSent(key: string): boolean {
  return getSentLog().has(key);
}

export interface StandupDataProvider {
  getProjects: () => string[];
  getStandupText: (project: string) => string;
}

/**
 * Check if any standup should be sent right now.
 * Call this every ~30 seconds from a setInterval.
 * Sends 5 minutes before the configured standup time.
 */
export async function checkAndSendStandups(provider: StandupDataProvider): Promise<string[]> {
  if (!isTelegramConfigured()) return [];

  const schedule = getStandupSchedule();
  const now = new Date();
  const today = now.toISOString().split("T")[0];
  const sent: string[] = [];

  for (const [project, timeStr] of Object.entries(schedule.times)) {
    if (!timeStr) continue;
    const [hh, mm] = timeStr.split(":").map(Number);
    if (isNaN(hh) || isNaN(mm)) continue;

    // Calculate T-5 minutes
    const standupDate = new Date(now);
    standupDate.setHours(hh, mm, 0, 0);
    const triggerDate = new Date(standupDate.getTime() - 5 * 60 * 1000);

    const key = `${project}:${today}`;

    // Fire if we're within the 5-minute window before standup
    if (now >= triggerDate && now < standupDate && !wasSent(key)) {
      if (!provider.getProjects().includes(project)) continue;
      
      try {
        const text = provider.getStandupText(project);
        if (text) {
          await sendTelegramMessage(text);
          markSent(key);
          sent.push(project);
        }
      } catch (err) {
        console.error(`[standup-scheduler] Failed to send for ${project}:`, err);
      }
    }
  }

  return sent;
}
