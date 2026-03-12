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

    const { actual, team } = extractDualHours(trimmed);
    const taskText = cleanTaskText(trimmed);

    const tags = extractTags(trimmed);
    const finalText = removeTags(taskText || trimmed);

    // hours = actual for backward compat; if no dual syntax, both equal the single value
    const hours = actual;

    tasks.push({
      text: finalText,
      hours,
      actualHours: actual,
      teamHours: team,
      source,
      tags,
    });
  }

  return tasks;
}

/**
 * Extract dual hours from text.
 * Supports:
 *   "task - 1h/3h"       → actual=1, team=3
 *   "task - 1.5h / 4h"   → actual=1.5, team=4
 *   "task - 1h (3h)"     → actual=1, team=3
 *   "task - 2ч/5ч"       → actual=2, team=5
 *   "task - 30m/2h"      → actual=0.5, team=2
 *   "task - 2h"           → actual=2, team=2 (single = both)
 */
function extractDualHours(text: string): { actual: number; team: number } {
  // Dual format: actual/team  e.g. "1h/3h", "1.5h / 4h", "30m/2h", "1ч/3ч"
  const dualSlash = text.match(
    /(\d*[.,]?\d+)\s*([hч](?:rs?|ours?)?|m(?:in(?:s|utes?)?)?|м)\s*\/\s*(\d*[.,]?\d+)\s*([hч](?:rs?|ours?)?|m(?:in(?:s|utes?)?)?|м)/i
  );
  if (dualSlash) {
    const actual = parseTimeValue(dualSlash[1], dualSlash[2]);
    const team = parseTimeValue(dualSlash[3], dualSlash[4]);
    if (actual <= 24 && team <= 24) return { actual, team };
  }

  // Dual format: actual (team)  e.g. "1h (3h)", "2ч (5ч)"
  const dualParen = text.match(
    /(\d*[.,]?\d+)\s*([hч](?:rs?|ours?)?|m(?:in(?:s|utes?)?)?|м)\s*\(\s*(\d*[.,]?\d+)\s*([hч](?:rs?|ours?)?|m(?:in(?:s|utes?)?)?|м)\s*\)/i
  );
  if (dualParen) {
    const actual = parseTimeValue(dualParen[1], dualParen[2]);
    const team = parseTimeValue(dualParen[3], dualParen[4]);
    if (actual <= 24 && team <= 24) return { actual, team };
  }

  // Single time: same value for both
  const single = extractHours(text);
  return { actual: single, team: single };
}

function parseTimeValue(numStr: string, unit: string): number {
  const val = parseFloat(numStr.replace(",", "."));
  const u = unit.toLowerCase();
  if (u.startsWith("m") || u === "м") return val / 60;
  return val;
}

function extractHours(text: string): number {
  // Combined hours+minutes: 1h30m, 2h15m, 1ч30м
  const hm = text.match(/(\d+)\s*[hч]\s*(\d+)\s*[mм]/i);
  if (hm) return parseInt(hm[1]) + parseInt(hm[2]) / 60;

  // Russian hours with comma decimal: 4,25ч or 4.25 ч or 3ч
  // Must be preceded by a separator (dash, parens, space-start) to avoid "at 15ч"
  const ru = text.match(/(?:^|[-–—(,]\s*)(\d+[.,]?\d*)\s*ч/i)
    || text.match(/\s(\d+[.,]?\d*)\s*ч\s*$/i);
  if (ru) {
    const val = parseFloat(ru[1].replace(",", "."));
    if (val <= 24) return val; // sanity: skip if > 24
  }

  // Hours: 2h, 1.5h, .5h, 2hrs, 0.5 hours
  // Must be preceded by separator or start-of-string to avoid "at 15h" / "deployed at 14h"
  const h = text.match(/(?:^|[-–—(,]\s*)(\d*\.?\d+)\s*(?:h(?:rs?|ours?)?)\b/i)
    || text.match(/\s(\d*\.?\d+)\s*(?:h(?:rs?|ours?)?)\s*$/i);
  if (h) {
    const val = parseFloat(h[1]);
    if (val <= 24) return val;
  }

  // Minutes only: 30m, 45min, 1.5m, 30 minutes, 30м
  const m = text.match(/(\d*\.?\d+)\s*(?:m(?:in(?:s|utes?)?)?|м)\b/i);
  if (m) return parseFloat(m[1]) / 60;

  return 0;
}

function cleanTaskText(text: string): string {
  return text
    // Remove dual-time patterns FIRST (before single patterns eat them)
    // With dash: "- 1h/3h", "- 1.5h / 4h", "- 30m/2h"
    .replace(/\s*[-–—]\s*\d*[.,]?\d+\s*(?:h(?:rs?|ours?)?|m(?:in(?:s|utes?)?)?|[чм])\s*\/\s*\d*[.,]?\d+\s*(?:h(?:rs?|ours?)?|m(?:in(?:s|utes?)?)?|[чм])\s*/gi, "")
    // Without dash: "3h/4h" at end or after space
    .replace(/\s+\d*[.,]?\d+\s*(?:h(?:rs?|ours?)?|m(?:in(?:s|utes?)?)?|[чм])\s*\/\s*\d*[.,]?\d+\s*(?:h(?:rs?|ours?)?|m(?:in(?:s|utes?)?)?|[чм])\s*$/gi, "")
    // "1h (3h)" with dash
    .replace(/\s*[-–—]\s*\d*[.,]?\d+\s*(?:h(?:rs?|ours?)?|m(?:in(?:s|utes?)?)?|[чм])\s*\(\s*\d*[.,]?\d+\s*(?:h(?:rs?|ours?)?|m(?:in(?:s|utes?)?)?|[чм])\s*\)\s*/gi, "")
    // "1h (3h)" without dash
    .replace(/\s+\d*[.,]?\d+\s*(?:h(?:rs?|ours?)?|m(?:in(?:s|utes?)?)?|[чм])\s*\(\s*\d*[.,]?\d+\s*(?:h(?:rs?|ours?)?|m(?:in(?:s|utes?)?)?|[чм])\s*\)\s*$/gi, "")
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
 * Parse a single line of text to extract task name and dual hours.
 * Useful for planning inputs that accept "task - 2h" or "task - 1h/3h" shorthand.
 */
export function parseTaskInput(text: string): { name: string; teamHours: number; actualHours: number } {
  const trimmed = text.trim().replace(/^[-•*]\s*/, "");
  if (!trimmed) return { name: "", teamHours: 0, actualHours: 0 };
  const { actual, team } = extractDualHours(trimmed);
  const name = cleanTaskText(trimmed) || trimmed;
  return { name, teamHours: team, actualHours: actual };
}

/**
 * Calculate similarity between two task strings (0..1)
 */
export function taskSimilarity(a: string, b: string): number {
  const na = normalize(a);
  const nb = normalize(b);
  if (na === nb) return 1;

  // Extract tags for comparison alongside text
  const tagsA = extractTags(a).sort().join(",");
  const tagsB = extractTags(b).sort().join(",");

  // If both are tag-only tasks, compare tags directly
  if (!na && !nb) {
    return tagsA === tagsB && tagsA.length > 0 ? 1 : 0;
  }

  // If one is empty after normalization but has matching tags, partial match
  if (!na || !nb) {
    return tagsA === tagsB && tagsA.length > 0 ? 0.6 : 0;
  }

  const wordsA = new Set(na.split(/\s+/));
  const wordsB = new Set(nb.split(/\s+/));
  const intersection = [...wordsA].filter((w) => wordsB.has(w)).length;
  const union = new Set([...wordsA, ...wordsB]).size;

  let textSim = union === 0 ? 0 : intersection / union;

  // Boost similarity if tags also match
  if (tagsA && tagsB && tagsA === tagsB) {
    textSim = Math.min(1, textSim + 0.2);
  }

  return textSim;
}

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/\[.*?\]/g, "")
    .replace(/[^a-zа-яё0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Extract [tag] patterns from text
 */
function extractTags(text: string): string[] {
  const matches = text.match(/\[([^\]]+)\]/g);
  if (!matches) return [];
  return matches.map((m) => m.slice(1, -1).trim().toLowerCase());
}

function removeTags(text: string): string {
  return text.replace(/\s*\[[^\]]+\]\s*/g, " ").trim();
}

/**
 * Get unique historical task names for autocomplete
 */
export function getHistoricalTaskNames(
  previousTasks: { task: ParsedTask; date: string }[]
): string[] {
  const seen = new Map<string, string>(); // lowercase -> original casing
  const counts = new Map<string, number>();
  for (const { task } of previousTasks) {
    const key = task.text.toLowerCase();
    if (!seen.has(key)) seen.set(key, task.text);
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([key]) => seen.get(key) || key);
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
