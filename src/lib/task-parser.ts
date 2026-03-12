import { ParsedTask } from "./types";

/**
 * Parse lines of text to extract tasks and hours.
 * Supports formats like:
 *   "Fixed login bug - 2h"
 *   "Code review - 1.5hrs"
 *   "3h - Deploy pipeline"
 *   "Meetings (2h)"
 *   "Stand-up, retro 1h"
 *   "Bug fix 30m"
 *   "Testing - 1h30m"
 *   "Задача - 3ч"
 *   "Ревью 4,25ч"
 */
export function parseTasks(text: string, source: "done" | "doing"): ParsedTask[] {
  if (!text.trim()) return [];

  const lines = text.split("\n").filter((l) => l.trim());
  const tasks: ParsedTask[] = [];

  for (const line of lines) {
    const trimmed = line.trim().replace(/^[-•*]\s*/, ""); // strip bullet points
    if (!trimmed) continue;

    const hours = extractHours(trimmed);
    const taskText = cleanTaskText(trimmed);

    tasks.push({
      text: taskText || trimmed,
      hours,
      source,
    });
  }

  return tasks;
}

function extractHours(text: string): number {
  // Combined hours+minutes: 1h30m, 2h15m, 1ч30м
  const hm = text.match(/(\d+)\s*[hч]\s*(\d+)\s*[mм]/i);
  if (hm) return parseInt(hm[1]) + parseInt(hm[2]) / 60;

  // Russian hours with comma decimal: 4,25ч or 4.25 ч or 3ч
  const ru = text.match(/(\d+[.,]?\d*)\s*ч/i);
  if (ru) return parseFloat(ru[1].replace(",", "."));

  // Hours: 2h, 1.5h, 2hrs, 0.5 hours
  const h = text.match(/(\d+\.?\d*)\s*(?:h(?:rs?|ours?)?)\b/i);
  if (h) return parseFloat(h[1]);

  // Minutes only: 30m, 45min, 30 minutes, 30м
  const m = text.match(/(\d+)\s*(?:m(?:in(?:s|utes?)?)?|м)\b/i);
  if (m) return parseInt(m[1]) / 60;

  return 0;
}

function cleanTaskText(text: string): string {
  return text
    // Remove Russian time patterns
    .replace(/\s*[-–—]\s*\d+[.,]?\d*\s*ч\s*/gi, "")
    .replace(/\s*\(\s*\d+[.,]?\d*\s*ч\s*\)\s*/gi, "")
    .replace(/^\d+[.,]?\d*\s*ч\s*[-–—]\s*/gi, "")
    .replace(/\s+\d+[.,]?\d*\s*ч\s*$/gi, "")
    .replace(/\d+\s*ч\s*\d+\s*м/gi, "")
    // Remove English time patterns
    .replace(/\s*[-–—]\s*\d+\.?\d*\s*(?:h(?:rs?|ours?)?|m(?:in(?:s|utes?)?)?)\s*/gi, "")
    .replace(/\s*\(\s*\d+\.?\d*\s*(?:h(?:rs?|ours?)?|m(?:in(?:s|utes?)?)?)\s*\)\s*/gi, "")
    .replace(/^\d+\.?\d*\s*(?:h(?:rs?|ours?)?|m(?:in(?:s|utes?)?)?)\s*[-–—]\s*/gi, "")
    .replace(/\s+\d+\.?\d*\s*(?:h(?:rs?|ours?)?|m(?:in(?:s|utes?)?)?)\s*$/gi, "")
    .replace(/\d+\s*h\s*\d+\s*m/gi, "")
    .trim();
}

/**
 * Calculate similarity between two task strings (0..1)
 */
export function taskSimilarity(a: string, b: string): number {
  const na = normalize(a);
  const nb = normalize(b);
  if (na === nb) return 1;
  if (!na || !nb) return 0;

  const wordsA = new Set(na.split(/\s+/));
  const wordsB = new Set(nb.split(/\s+/));
  const intersection = [...wordsA].filter((w) => wordsB.has(w)).length;
  const union = new Set([...wordsA, ...wordsB]).size;

  return union === 0 ? 0 : intersection / union;
}

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-zа-яё0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export interface MergeSuggestion {
  currentTask: ParsedTask;
  previousTask: ParsedTask;
  previousDate: string;
  similarity: number;
}

/**
 * Find tasks from previous entries that are similar to current tasks
 */
export function findMergeSuggestions(
  currentTasks: ParsedTask[],
  previousTasks: { task: ParsedTask; date: string }[]
): MergeSuggestion[] {
  const suggestions: MergeSuggestion[] = [];
  const THRESHOLD = 0.4;

  for (const current of currentTasks) {
    for (const prev of previousTasks) {
      const sim = taskSimilarity(current.text, prev.task.text);
      if (sim >= THRESHOLD && sim < 1) {
        suggestions.push({
          currentTask: current,
          previousTask: prev.task,
          previousDate: prev.date,
          similarity: sim,
        });
      }
    }
  }

  // Sort by similarity desc, dedupe by current task
  suggestions.sort((a, b) => b.similarity - a.similarity);
  const seen = new Set<string>();
  return suggestions.filter((s) => {
    const key = s.currentTask.text;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
