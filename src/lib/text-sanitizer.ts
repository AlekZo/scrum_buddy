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
