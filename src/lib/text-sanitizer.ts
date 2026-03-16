/**
 * Strip actual hours from task text, keeping only team hours for external display.
 * "API mapping - 1h/3h" → "API mapping - 3h"
 * "Bug fix - 2h (4h)" → "Bug fix - 4h"
 * "Simple task - 2h" → "Simple task - 2h" (unchanged)
 */
export function stripActualHours(text: string): string {
  if (!text) return text;
  return text
    .split("\n")
    .map((line) => {
      // Replace "1h/3h" with just "3h" (keep team = second value)
      let result = line.replace(
        /(\d*[.,]?\d+)\s*([hч](?:rs?|ours?)?|m(?:in(?:s|utes?)?)?|м)\s*\/\s*(\d*[.,]?\d+)\s*([hч](?:rs?|ours?)?|m(?:in(?:s|utes?)?)?|м)/gi,
        "$3$4"
      );
      // Replace "1h (3h)" with just "3h" (keep team = parenthesized value)
      result = result.replace(
        /(\d*[.,]?\d+)\s*(?:h(?:rs?|ours?)?|m(?:in(?:s|utes?)?)?|[чм])\s*\((\s*(\d*[.,]?\d+)\s*([hч](?:rs?|ours?)?|m(?:in(?:s|utes?)?)?|м)\s*)\)/gi,
        "$3$4"
      );
      return result;
    })
    .join("\n");
}

/**
 * Strip ALL time/hour references from text for presentation mode.
 * "Fixed auth bug - 2h" → "Fixed auth bug"
 * "Code review - 1.5h/3h" → "Code review"
 * "Standup 30m" → "Standup"
 */
export function stripAllHours(text: string): string {
  if (!text) return text;
  return text
    .split("\n")
    .map((line) => {
      return line
        // Dual time patterns: "1h/3h", "1.5h / 4h", "30m/2h"
        .replace(/\s*[-–—]\s*\d*[.,]?\d+\s*(?:h(?:rs?|ours?)?|m(?:in(?:s|utes?)?)?|[чм])\s*\/\s*\d*[.,]?\d+\s*(?:h(?:rs?|ours?)?|m(?:in(?:s|utes?)?)?|[чм])\s*/gi, "")
        .replace(/\s+\d*[.,]?\d+\s*(?:h(?:rs?|ours?)?|m(?:in(?:s|utes?)?)?|[чм])\s*\/\s*\d*[.,]?\d+\s*(?:h(?:rs?|ours?)?|m(?:in(?:s|utes?)?)?|[чм])\s*$/gi, "")
        // "1h (3h)" patterns
        .replace(/\s*[-–—]\s*\d*[.,]?\d+\s*(?:h(?:rs?|ours?)?|m(?:in(?:s|utes?)?)?|[чм])\s*\(\s*\d*[.,]?\d+\s*(?:h(?:rs?|ours?)?|m(?:in(?:s|utes?)?)?|[чм])\s*\)\s*/gi, "")
        .replace(/\s+\d*[.,]?\d+\s*(?:h(?:rs?|ours?)?|m(?:in(?:s|utes?)?)?|[чм])\s*\(\s*\d*[.,]?\d+\s*(?:h(?:rs?|ours?)?|m(?:in(?:s|utes?)?)?|[чм])\s*\)\s*$/gi, "")
        // Dash-separated dual: "1.5h-4h"
        .replace(/\d*[.,]?\d+\s*(?:h(?:rs?|ours?)?|m(?:in(?:s|utes?)?)?|[чм])[-–—]\d*[.,]?\d+\s*(?:h(?:rs?|ours?)?|m(?:in(?:s|utes?)?)?|[чм])/gi, "")
        // Combined: "1h30m", "2ч30м"
        .replace(/\d+\s*[hч]\s*\d+\s*[mм]/gi, "")
        // Single time with dash: "- 2h", "- 30m"
        .replace(/\s*[-–—]\s*\d+[.,]?\d*\s*(?:h(?:rs?|ours?)?|m(?:in(?:s|utes?)?)?|[чм])\s*/gi, "")
        // Parenthesized: "(2h)", "(30m)"
        .replace(/\s*\(\s*\d+[.,]?\d*\s*(?:h(?:rs?|ours?)?|m(?:in(?:s|utes?)?)?|[чм])\s*\)\s*/gi, "")
        // Leading time: "2h - task"
        .replace(/^\d+[.,]?\d*\s*(?:h(?:rs?|ours?)?|m(?:in(?:s|utes?)?)?|[чм])\s*[-–—]\s*/gi, "")
        // Trailing time: "task 2h"
        .replace(/\s+\d+[.,]?\d*\s*(?:h(?:rs?|ours?)?|m(?:in(?:s|utes?)?)?|[чм])\s*$/gi, "")
        // Clean trailing separators
        .replace(/\s*[-–—:]\s*$/g, "")
        .trim();
    })
    .join("\n");
}
