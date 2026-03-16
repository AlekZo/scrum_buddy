/**
 * Browser-based file reader for extracting text from uploaded files.
 * Supports .txt, .md, .csv, .json — no backend needed.
 */

const SUPPORTED_EXTENSIONS = [".txt", ".md", ".csv", ".json", ".markdown"];
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

export function isSupportedFile(file: File): boolean {
  const ext = "." + file.name.split(".").pop()?.toLowerCase();
  return SUPPORTED_EXTENSIONS.includes(ext);
}

export function getFileExtension(file: File): string {
  return "." + (file.name.split(".").pop()?.toLowerCase() || "");
}

export async function readFileAsText(file: File): Promise<string> {
  if (file.size > MAX_FILE_SIZE) {
    throw new Error(`File too large (${(file.size / 1024 / 1024).toFixed(1)}MB). Max: 5MB.`);
  }
  if (!isSupportedFile(file)) {
    throw new Error(`Unsupported file type. Use: ${SUPPORTED_EXTENSIONS.join(", ")}`);
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsText(file);
  });
}

/**
 * Extract meaningful content from file text, trimming excess whitespace
 */
export function extractFileContent(text: string, maxChars: number = 8000): string {
  const cleaned = text
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (cleaned.length <= maxChars) return cleaned;
  return cleaned.slice(0, maxChars) + "\n\n...[truncated]";
}
